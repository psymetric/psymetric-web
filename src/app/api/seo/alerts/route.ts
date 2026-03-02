/**
 * GET /api/seo/alerts — SIL-9 Option A: Compute-on-Read Alert Surface (MVP T1–T3)
 *
 * SIL-9.1 additions: alert filtering + deterministic keyset pagination.
 *
 * Returns deterministic alert records derived from snapshot history.
 * No writes. No EventLog. No schema changes. No background jobs.
 * All trigger conditions are functions of included snapshot rows only.
 *
 * Trigger types:
 *   T1 — Volatility Regime Transition
 *         Emitted when the regime of the most recent consecutive pair differs
 *         from the regime of the immediately preceding pair (per keyword).
 *         Requires >= 3 snapshots in window (>= 2 pairs).
 *   T2 — Spike Threshold Exceedance
 *         Emitted for every pair whose pairVolatilityScore > spikeThreshold.
 *         Deduped within response by (keywordTargetId, toSnapshotId, threshold).
 *   T3 — Risk Concentration Exceedance
 *         Emitted at most once per request when volatilityConcentrationRatio
 *         (B2 formula) > concentrationThreshold and is non-null.
 *
 * Query params:
 *   windowDays             required  integer 1–30
 *   spikeThreshold         optional  float 0–100,  default 75.00
 *   concentrationThreshold optional  float 0–1,    default 0.80
 *   limit                  optional  integer 1–200, default 100
 *   cursor                 optional  opaque base64url string (keyset pagination)
 *
 * SIL-9.1 filter params (all optional, all validated before any DB work):
 *   triggerTypes           comma-separated subset of T1,T2,T3
 *                          If absent → all types returned.
 *                          If keywordTargetId present → T3 automatically excluded.
 *   keywordTargetId        UUID — filters to alerts for a single keyword;
 *                          T3 (project-scope) is excluded when this is present.
 *   minSeverityRank        integer 0–999 — excludes alerts with severityRank below this.
 *   minPairVolatilityScore float 0–100 — only applied to T2 alerts; T1/T3 unaffected.
 *
 * Deterministic ordering (unchanged from SIL-9):
 *   1. severityRank DESC
 *   2. toCapturedAt DESC
 *   3. triggerType ASC
 *   4. keywordTargetId ASC (nulls last)
 *   5. toSnapshotId DESC  (nulls last)
 *
 * Keyset cursor encodes all five sort key fields as base64url JSON.
 * isAfterCursor() mirrors compareAlerts() exactly.
 *
 * Isolation: resolveProjectId(request) — headers only.
 *   /alerts is a project-scope endpoint; no :id in path; all data scoped to resolved projectId.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, successResponse } from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import {
  computeVolatility,
  classifyRegime,
  VolatilityRegime,
  SnapshotForVolatility,
} from "@/lib/seo/volatility-service";

// =============================================================================
// Constants
// =============================================================================

const WINDOW_DAYS_MIN = 1;
const WINDOW_DAYS_MAX = 30;

const SPIKE_THRESHOLD_DEFAULT         = 75.00;
const SPIKE_THRESHOLD_MIN             = 0;
const SPIKE_THRESHOLD_MAX             = 100;

const CONCENTRATION_THRESHOLD_DEFAULT = 0.80;
const CONCENTRATION_THRESHOLD_MIN     = 0;
const CONCENTRATION_THRESHOLD_MAX     = 1;

const LIMIT_DEFAULT = 100;
const LIMIT_MIN     = 1;
const LIMIT_MAX     = 200;

const MIN_SEVERITY_RANK_MIN = 0;
const MIN_SEVERITY_RANK_MAX = 999;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_TRIGGER_TYPES = new Set(["T1", "T2", "T3"] as const);
type TriggerTypeToken = "T1" | "T2" | "T3";

// =============================================================================
// Severity rank — derived from trigger type + regime transition direction.
// Higher rank = higher severity. Never stored; always derived at sort time.
// T3 risk concentration = 7 (project-wide, high operational urgency).
// T2 spike = 6 (single-pair event, chaotic boundary).
// T1 regime transitions ranked by severity per SIL-9 spec advisory map.
// =============================================================================

const REGIME_TO_INT: Record<VolatilityRegime, number> = {
  calm:     0,
  shifting: 1,
  unstable: 2,
  chaotic:  3,
};

function t1SeverityRank(fromRegime: VolatilityRegime, toRegime: VolatilityRegime): number {
  const from = REGIME_TO_INT[fromRegime];
  const to   = REGIME_TO_INT[toRegime];

  if (from >= to) {
    // Recovery / no escalation — info level → rank 1
    return 1;
  }
  // Escalation: rank by destination regime and jump distance
  const jump = to - from;
  if (to === 3) {
    // → chaotic: calm→chaotic or shifting→chaotic = 5, unstable→chaotic = 4
    return jump >= 2 ? 5 : 4;
  }
  if (to === 2) {
    // → unstable: calm→unstable = 4, shifting→unstable = 3
    return jump === 2 ? 4 : 3;
  }
  // → shifting (calm→shifting) = 2
  return 2;
}

// =============================================================================
// Alert union types
// =============================================================================

interface T1Alert {
  triggerType:         "T1";
  keywordTargetId:     string;
  query:               string;
  fromRegime:          VolatilityRegime;
  toRegime:            VolatilityRegime;
  fromSnapshotId:      string;
  toSnapshotId:        string;
  fromCapturedAt:      string; // ISO
  toCapturedAt:        string; // ISO
  pairVolatilityScore: number;
  // sort-assist fields (stripped before emission)
  _severityRank:       number;
  _toCapturedAtMs:     number;
  _toSnapshotId:       string;
  _keywordTargetId:    string;
}

interface T2Alert {
  triggerType:         "T2";
  keywordTargetId:     string;
  query:               string;
  fromSnapshotId:      string;
  toSnapshotId:        string;
  fromCapturedAt:      string; // ISO
  toCapturedAt:        string; // ISO
  pairVolatilityScore: number;
  threshold:           number;
  exceedanceMargin:    number;
  // sort-assist
  _severityRank:       number;
  _toCapturedAtMs:     number;
  _toSnapshotId:       string;
  _keywordTargetId:    string;
}

interface T3Alert {
  triggerType:                  "T3";
  projectId:                    string;
  volatilityConcentrationRatio: number;
  threshold:                    number;
  top3RiskKeywords:             Array<{
    keywordTargetId:  string;
    query:            string;
    volatilityScore:  number;
    volatilityRegime: VolatilityRegime;
  }>;
  activeKeywordCount: number;
  // sort-assist (latestCapturedAt in window, used as toCapturedAt equivalent)
  _severityRank:     number;
  _toCapturedAtMs:   number;
  _toSnapshotId:     null;
  _keywordTargetId:  null;
}

type AnyAlert = T1Alert | T2Alert | T3Alert;

// Emitted shapes (sort-assist fields stripped)
type T1Emitted    = Omit<T1Alert, "_severityRank" | "_toCapturedAtMs" | "_toSnapshotId" | "_keywordTargetId">;
type T2Emitted    = Omit<T2Alert, "_severityRank" | "_toCapturedAtMs" | "_toSnapshotId" | "_keywordTargetId">;
type T3Emitted    = Omit<T3Alert, "_severityRank" | "_toCapturedAtMs" | "_toSnapshotId" | "_keywordTargetId">;
type AlertEmitted = T1Emitted | T2Emitted | T3Emitted;

// =============================================================================
// Cursor
//
// Payload fields (abbreviated keys for compactness):
//   s  — severityRank (number)
//   t  — toCapturedAtMs (number, unix ms)
//   tt — triggerType ("T1" | "T2" | "T3")
//   k  — keywordTargetId (string | null)
//   sn — toSnapshotId (string | null)
//
// Encoded as base64url(JSON.stringify(payload)).
// Decoded payload is validated before use; malformed → 400.
// =============================================================================

interface CursorPayload {
  s:  number;
  t:  number;
  tt: TriggerTypeToken;
  k:  string | null;
  sn: string | null;
}

function encodeCursor(alert: AnyAlert): string {
  const payload: CursorPayload = {
    s:  alert._severityRank,
    t:  alert._toCapturedAtMs,
    tt: alert.triggerType,
    k:  alert._keywordTargetId,
    sn: alert._toSnapshotId,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(
  raw: string
): { payload: CursorPayload } | { error: string } {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const p = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof p.s  !== "number" ||
      typeof p.t  !== "number" ||
      typeof p.tt !== "string" ||
      !VALID_TRIGGER_TYPES.has(p.tt as TriggerTypeToken) ||
      (p.k  !== null && typeof p.k  !== "string") ||
      (p.sn !== null && typeof p.sn !== "string")
    ) {
      return { error: "cursor is invalid: missing or malformed fields" };
    }
    return {
      payload: {
        s:  p.s  as number,
        t:  p.t  as number,
        tt: p.tt as TriggerTypeToken,
        k:  p.k  as string | null,
        sn: p.sn as string | null,
      },
    };
  } catch {
    return { error: "cursor is invalid: not valid base64url JSON" };
  }
}

// =============================================================================
// Deterministic sort comparator
//
// Order (per SIL-9 spec — unchanged in SIL-9.1):
//   1. severityRank DESC
//   2. toCapturedAt DESC
//   3. triggerType ASC
//   4. keywordTargetId ASC (nulls last)
//   5. toSnapshotId DESC (nulls last)
// =============================================================================

function compareAlerts(a: AnyAlert, b: AnyAlert): number {
  // 1. severityRank DESC
  if (b._severityRank !== a._severityRank) return b._severityRank - a._severityRank;
  // 2. toCapturedAt DESC
  if (b._toCapturedAtMs !== a._toCapturedAtMs) return b._toCapturedAtMs - a._toCapturedAtMs;
  // 3. triggerType ASC
  if (a.triggerType < b.triggerType) return -1;
  if (a.triggerType > b.triggerType) return 1;
  // 4. keywordTargetId ASC (nulls last)
  const aKtId = a._keywordTargetId;
  const bKtId = b._keywordTargetId;
  if (aKtId === null && bKtId === null) {
    // both null — proceed to next key
  } else if (aKtId === null) {
    return 1;
  } else if (bKtId === null) {
    return -1;
  } else {
    const cmp = aKtId.localeCompare(bKtId);
    if (cmp !== 0) return cmp;
  }
  // 5. toSnapshotId DESC (nulls last)
  const aSnId = a._toSnapshotId;
  const bSnId = b._toSnapshotId;
  if (aSnId === null && bSnId === null) return 0;
  if (aSnId === null) return 1;
  if (bSnId === null) return -1;
  if (bSnId > aSnId) return 1;
  if (bSnId < aSnId) return -1;
  return 0;
}

// =============================================================================
// isAfterCursor — returns true when alert comes strictly AFTER cursor position
// in the total ordering defined by compareAlerts.
//
// This mirrors compareAlerts key-by-key. "After" in DESC fields means smaller
// value; "after" in ASC fields means larger value. Nulls-last rules preserved.
//
// CRITICAL: must stay in sync with compareAlerts. If the sort order changes,
// this function must change too.
// =============================================================================

function isAfterCursor(alert: AnyAlert, cur: CursorPayload): boolean {
  // 1. severityRank DESC — after means alert.s < cur.s
  if (alert._severityRank !== cur.s) return alert._severityRank < cur.s;

  // 2. toCapturedAt DESC — after means alert.t < cur.t
  if (alert._toCapturedAtMs !== cur.t) return alert._toCapturedAtMs < cur.t;

  // 3. triggerType ASC — after means alert.tt > cur.tt
  if (alert.triggerType !== cur.tt) return alert.triggerType > cur.tt;

  // 4. keywordTargetId ASC (nulls last)
  const ak = alert._keywordTargetId;
  const ck = cur.k;
  if (ak !== ck) {
    if (ak === null) return true;   // null is last → alert comes after non-null cursor
    if (ck === null) return false;  // alert is non-null, cursor is null → alert comes before
    return ak.localeCompare(ck) > 0;
  }

  // 5. toSnapshotId DESC (nulls last)
  const asn = alert._toSnapshotId;
  const csn = cur.sn;
  if (asn !== csn) {
    if (asn === null) return true;  // null is last → after
    if (csn === null) return false;
    return asn < csn; // DESC — after means smaller string
  }

  // Exact match on all keys — not strictly after
  return false;
}

// =============================================================================
// Strip sort-assist fields before returning to client
// =============================================================================

function stripSortFields(alert: AnyAlert): AlertEmitted {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _severityRank, _toCapturedAtMs, _toSnapshotId, _keywordTargetId, ...emitted } = alert;
  return emitted as AlertEmitted;
}

// =============================================================================
// Param parsers
// =============================================================================

function parseWindowDays(
  sp: URLSearchParams
): { windowDays: number } | { error: string } {
  const raw = sp.get("windowDays");
  if (raw === null) return { error: "windowDays is required" };
  if (!/^\d+$/.test(raw)) return { error: "windowDays must be an integer" };
  const n = parseInt(raw, 10);
  if (n < WINDOW_DAYS_MIN) return { error: `windowDays must be >= ${WINDOW_DAYS_MIN}` };
  if (n > WINDOW_DAYS_MAX) return { error: `windowDays must be <= ${WINDOW_DAYS_MAX}` };
  return { windowDays: n };
}

function parseSpikeThreshold(
  sp: URLSearchParams
): { spikeThreshold: number } | { error: string } {
  const raw = sp.get("spikeThreshold");
  if (raw === null) return { spikeThreshold: SPIKE_THRESHOLD_DEFAULT };
  const n = parseFloat(raw);
  if (isNaN(n)) return { error: "spikeThreshold must be a number" };
  if (n < SPIKE_THRESHOLD_MIN) return { error: `spikeThreshold must be >= ${SPIKE_THRESHOLD_MIN}` };
  if (n > SPIKE_THRESHOLD_MAX) return { error: `spikeThreshold must be <= ${SPIKE_THRESHOLD_MAX}` };
  return { spikeThreshold: n };
}

function parseConcentrationThreshold(
  sp: URLSearchParams
): { concentrationThreshold: number } | { error: string } {
  const raw = sp.get("concentrationThreshold");
  if (raw === null) return { concentrationThreshold: CONCENTRATION_THRESHOLD_DEFAULT };
  const n = parseFloat(raw);
  if (isNaN(n)) return { error: "concentrationThreshold must be a number" };
  if (n < CONCENTRATION_THRESHOLD_MIN) return { error: `concentrationThreshold must be >= ${CONCENTRATION_THRESHOLD_MIN}` };
  if (n > CONCENTRATION_THRESHOLD_MAX) return { error: `concentrationThreshold must be <= ${CONCENTRATION_THRESHOLD_MAX}` };
  return { concentrationThreshold: n };
}

function parseLimit(
  sp: URLSearchParams
): { limit: number } | { error: string } {
  const raw = sp.get("limit");
  if (raw === null) return { limit: LIMIT_DEFAULT };
  if (!/^\d+$/.test(raw)) return { error: "limit must be an integer" };
  const n = parseInt(raw, 10);
  if (n < LIMIT_MIN) return { error: `limit must be >= ${LIMIT_MIN}` };
  if (n > LIMIT_MAX) return { error: `limit must be <= ${LIMIT_MAX}` };
  return { limit: n };
}

function parseTriggerTypes(
  sp: URLSearchParams
): { triggerTypes: Set<TriggerTypeToken> | null } | { error: string } {
  const raw = sp.get("triggerTypes");
  if (raw === null) return { triggerTypes: null }; // null = no filter, all types
  const tokens = raw.split(",").map((t) => t.trim());
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
    return { error: "triggerTypes must not be empty" };
  }
  const set = new Set<TriggerTypeToken>();
  for (const token of tokens) {
    if (!VALID_TRIGGER_TYPES.has(token as TriggerTypeToken)) {
      return { error: `triggerTypes contains invalid token: "${token}". Valid values: T1, T2, T3` };
    }
    set.add(token as TriggerTypeToken);
  }
  return { triggerTypes: set };
}

function parseKeywordTargetId(
  sp: URLSearchParams
): { keywordTargetId: string | null } | { error: string } {
  const raw = sp.get("keywordTargetId");
  if (raw === null) return { keywordTargetId: null };
  if (!UUID_RE.test(raw)) return { error: "keywordTargetId must be a valid UUID" };
  return { keywordTargetId: raw };
}

function parseMinSeverityRank(
  sp: URLSearchParams
): { minSeverityRank: number | null } | { error: string } {
  const raw = sp.get("minSeverityRank");
  if (raw === null) return { minSeverityRank: null };
  if (!/^\d+$/.test(raw)) return { error: "minSeverityRank must be an integer" };
  const n = parseInt(raw, 10);
  if (n < MIN_SEVERITY_RANK_MIN) return { error: `minSeverityRank must be >= ${MIN_SEVERITY_RANK_MIN}` };
  if (n > MIN_SEVERITY_RANK_MAX) return { error: `minSeverityRank must be <= ${MIN_SEVERITY_RANK_MAX}` };
  return { minSeverityRank: n };
}

function parseMinPairVolatilityScore(
  sp: URLSearchParams
): { minPairVolatilityScore: number | null } | { error: string } {
  const raw = sp.get("minPairVolatilityScore");
  if (raw === null) return { minPairVolatilityScore: null };
  const n = parseFloat(raw);
  if (isNaN(n)) return { error: "minPairVolatilityScore must be a number" };
  if (n < 0)   return { error: "minPairVolatilityScore must be >= 0" };
  if (n > 100) return { error: "minPairVolatilityScore must be <= 100" };
  return { minPairVolatilityScore: n };
}

function parseCursor(
  sp: URLSearchParams
): { cursor: CursorPayload | null } | { error: string } {
  const raw = sp.get("cursor");
  if (raw === null) return { cursor: null };
  const result = decodeCursor(raw);
  if ("error" in result) return { error: result.error };
  return { cursor: result.payload };
}

// =============================================================================
// GET /api/seo/alerts
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const sp = new URL(request.url).searchParams;

    // -- Parse all params before any DB work ----------------------------------
    const windowResult = parseWindowDays(sp);
    if ("error" in windowResult) return badRequest(windowResult.error);
    const windowDays = windowResult.windowDays;

    const spikeResult = parseSpikeThreshold(sp);
    if ("error" in spikeResult) return badRequest(spikeResult.error);
    const spikeThreshold = spikeResult.spikeThreshold;

    const concResult = parseConcentrationThreshold(sp);
    if ("error" in concResult) return badRequest(concResult.error);
    const concentrationThreshold = concResult.concentrationThreshold;

    const limitResult = parseLimit(sp);
    if ("error" in limitResult) return badRequest(limitResult.error);
    const limit = limitResult.limit;

    const ttResult = parseTriggerTypes(sp);
    if ("error" in ttResult) return badRequest(ttResult.error);
    const triggerTypesFilter = ttResult.triggerTypes; // null = no filter

    const ktIdResult = parseKeywordTargetId(sp);
    if ("error" in ktIdResult) return badRequest(ktIdResult.error);
    const keywordTargetIdFilter = ktIdResult.keywordTargetId; // null = no filter

    const minSevResult = parseMinSeverityRank(sp);
    if ("error" in minSevResult) return badRequest(minSevResult.error);
    const minSeverityRank = minSevResult.minSeverityRank; // null = no filter

    const minPvsResult = parseMinPairVolatilityScore(sp);
    if ("error" in minPvsResult) return badRequest(minPvsResult.error);
    const minPairVolatilityScore = minPvsResult.minPairVolatilityScore; // null = no filter

    const cursorResult = parseCursor(sp);
    if ("error" in cursorResult) return badRequest(cursorResult.error);
    const cursorPayload = cursorResult.cursor; // null = first page

    // If keywordTargetId filter is present, T3 is excluded (T3 is project-scope,
    // not keyword-scope; its keywordTargetId is null, which cannot match a UUID).
    // This is enforced in the filter step below — no special branching needed here.

    // Single requestTime anchor — all window boundaries derived here.
    const requestTime = new Date();
    const windowStart = new Date(requestTime.getTime() - windowDays * 24 * 60 * 60 * 1000);

    // ── Query 1: KeywordTargets ───────────────────────────────────────────────
    const targets = await prisma.keywordTarget.findMany({
      where:   { projectId },
      orderBy: [{ query: "asc" }, { id: "asc" }],
      select:  { id: true, query: true, locale: true, device: true },
    });

    // ── Query 2: SERPSnapshots (window-filtered, project-scoped) ─────────────
    const allSnapshots = await prisma.sERPSnapshot.findMany({
      where: {
        projectId,
        capturedAt: { gte: windowStart },
      },
      orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
      select: {
        id:               true,
        query:            true,
        locale:           true,
        device:           true,
        capturedAt:       true,
        aiOverviewStatus: true,
        rawPayload:       true,
      },
    });

    // ── Group snapshots by natural key ────────────────────────────────────────
    type SnapRow = SnapshotForVolatility & { capturedAt: Date };
    const snapshotMap = new Map<string, SnapRow[]>();
    let latestCapturedAtMs = 0;

    for (const snap of allSnapshots) {
      const key = `${snap.query}\0${snap.locale}\0${snap.device}`;
      let bucket = snapshotMap.get(key);
      if (!bucket) { bucket = []; snapshotMap.set(key, bucket); }
      bucket.push({
        id:               snap.id,
        capturedAt:       snap.capturedAt,
        aiOverviewStatus: snap.aiOverviewStatus,
        rawPayload:       snap.rawPayload,
      });
      const ms = snap.capturedAt.getTime();
      if (ms > latestCapturedAtMs) latestCapturedAtMs = ms;
    }

    // ── Collect all candidate alerts (unfiltered) ─────────────────────────────
    const allAlerts: AnyAlert[] = [];

    // T2 dedup key set: (keywordTargetId, toSnapshotId, threshold)
    const t2DedupSet = new Set<string>();

    // B2 accumulators for T3
    let activeKeywordCount = 0;
    let totalVolatilitySum = 0;
    interface ActiveRecord {
      keywordTargetId: string;
      query:           string;
      volatilityScore: number;
    }
    const activeRecords: ActiveRecord[] = [];

    for (const target of targets) {
      const key   = `${target.query}\0${target.locale}\0${target.device}`;
      const snaps = snapshotMap.get(key) ?? [];

      if (snaps.length < 2) continue;

      // Compute all consecutive pairs
      interface PairRecord {
        fromSnapshotId:      string;
        toSnapshotId:        string;
        fromCapturedAt:      Date;
        toCapturedAt:        Date;
        pairVolatilityScore: number;
        regime:              VolatilityRegime;
      }

      const pairs: PairRecord[] = [];
      for (let i = 0; i < snaps.length - 1; i++) {
        const A = snaps[i];
        const B = snaps[i + 1];
        const profile = computeVolatility([A, B]);
        pairs.push({
          fromSnapshotId:      A.id,
          toSnapshotId:        B.id,
          fromCapturedAt:      A.capturedAt,
          toCapturedAt:        B.capturedAt,
          pairVolatilityScore: profile.volatilityScore,
          regime:              classifyRegime(profile.volatilityScore),
        });
      }

      // Accumulate full-keyword volatility for T3
      const fullProfile = computeVolatility(snaps);
      if (fullProfile.sampleSize >= 1) {
        activeKeywordCount++;
        totalVolatilitySum += fullProfile.volatilityScore;
        activeRecords.push({
          keywordTargetId: target.id,
          query:           target.query,
          volatilityScore: fullProfile.volatilityScore,
        });
      }

      // ── T1: Regime Transition ─────────────────────────────────────────────
      if (pairs.length >= 2) {
        const lastPair = pairs[pairs.length - 1];
        const prevPair = pairs[pairs.length - 2];
        if (lastPair.regime !== prevPair.regime) {
          const fromRegime = prevPair.regime;
          const toRegime   = lastPair.regime;
          const sevRank    = t1SeverityRank(fromRegime, toRegime);
          allAlerts.push({
            triggerType:         "T1",
            keywordTargetId:     target.id,
            query:               target.query,
            fromRegime,
            toRegime,
            fromSnapshotId:      lastPair.fromSnapshotId,
            toSnapshotId:        lastPair.toSnapshotId,
            fromCapturedAt:      lastPair.fromCapturedAt.toISOString(),
            toCapturedAt:        lastPair.toCapturedAt.toISOString(),
            pairVolatilityScore: lastPair.pairVolatilityScore,
            _severityRank:       sevRank,
            _toCapturedAtMs:     lastPair.toCapturedAt.getTime(),
            _toSnapshotId:       lastPair.toSnapshotId,
            _keywordTargetId:    target.id,
          });
        }
      }

      // ── T2: Spike Threshold Exceedance ────────────────────────────────────
      for (const pair of pairs) {
        if (pair.pairVolatilityScore > spikeThreshold) {
          const dedupKey = `${target.id}\0${pair.toSnapshotId}\0${spikeThreshold}`;
          if (!t2DedupSet.has(dedupKey)) {
            t2DedupSet.add(dedupKey);
            const exceedanceMargin = Math.round((pair.pairVolatilityScore - spikeThreshold) * 100) / 100;
            allAlerts.push({
              triggerType:         "T2",
              keywordTargetId:     target.id,
              query:               target.query,
              fromSnapshotId:      pair.fromSnapshotId,
              toSnapshotId:        pair.toSnapshotId,
              fromCapturedAt:      pair.fromCapturedAt.toISOString(),
              toCapturedAt:        pair.toCapturedAt.toISOString(),
              pairVolatilityScore: pair.pairVolatilityScore,
              threshold:           spikeThreshold,
              exceedanceMargin,
              _severityRank:       6,
              _toCapturedAtMs:     pair.toCapturedAt.getTime(),
              _toSnapshotId:       pair.toSnapshotId,
              _keywordTargetId:    target.id,
            });
          }
        }
      }
    }

    // ── T3: Risk Concentration Exceedance ─────────────────────────────────────
    if (totalVolatilitySum > 0) {
      activeRecords.sort((a, b) => {
        if (b.volatilityScore !== a.volatilityScore) return b.volatilityScore - a.volatilityScore;
        const qCmp = a.query.localeCompare(b.query);
        if (qCmp !== 0) return qCmp;
        return a.keywordTargetId.localeCompare(b.keywordTargetId);
      });
      const top3    = activeRecords.slice(0, 3);
      const top3Sum = top3.reduce((acc, r) => acc + r.volatilityScore, 0);
      const volatilityConcentrationRatio = Math.round((top3Sum / totalVolatilitySum) * 10000) / 10000;

      if (volatilityConcentrationRatio > concentrationThreshold) {
        const top3RiskKeywords = top3.map((r) => ({
          keywordTargetId:  r.keywordTargetId,
          query:            r.query,
          volatilityScore:  r.volatilityScore,
          volatilityRegime: classifyRegime(r.volatilityScore),
        }));
        allAlerts.push({
          triggerType:                  "T3",
          projectId,
          volatilityConcentrationRatio,
          threshold:                    concentrationThreshold,
          top3RiskKeywords,
          activeKeywordCount,
          _severityRank:                7,
          _toCapturedAtMs:              latestCapturedAtMs,
          _toSnapshotId:                null,
          _keywordTargetId:             null,
        });
      }
    }

    // ── Sort deterministically ────────────────────────────────────────────────
    allAlerts.sort(compareAlerts);

    // ── Apply filters (post-sort; filtering never changes order, only membership) ─
    // The filtered array preserves relative order of the sorted allAlerts array.
    const filtered = allAlerts.filter((alert) => {
      // triggerType filter
      if (triggerTypesFilter !== null && !triggerTypesFilter.has(alert.triggerType)) {
        return false;
      }
      // keywordTargetId filter — T3 has null _keywordTargetId, so it is
      // excluded whenever keywordTargetIdFilter is a non-null UUID.
      if (keywordTargetIdFilter !== null && alert._keywordTargetId !== keywordTargetIdFilter) {
        return false;
      }
      // minSeverityRank filter
      if (minSeverityRank !== null && alert._severityRank < minSeverityRank) {
        return false;
      }
      // minPairVolatilityScore filter — only applied to T2
      if (minPairVolatilityScore !== null && alert.triggerType === "T2") {
        if ((alert as T2Alert).pairVolatilityScore < minPairVolatilityScore) {
          return false;
        }
      }
      return true;
    });

    // ── Apply cursor (keyset positional cut — in-memory after filter+sort) ────
    // filtered is already in deterministic sort order.
    // Find the first item strictly after the cursor position.
    let startIndex = 0;
    if (cursorPayload !== null) {
      // Linear scan to find the first item after cursor.
      // Correct and deterministic; for typical alert volumes (< 1000) this is fast.
      let found = false;
      for (let i = 0; i < filtered.length; i++) {
        if (isAfterCursor(filtered[i], cursorPayload)) {
          startIndex = i;
          found = true;
          break;
        }
      }
      if (!found) startIndex = filtered.length; // cursor is past the end → empty page
    }

    // ── Slice page ────────────────────────────────────────────────────────────
    const page    = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;

    // nextCursor encodes the last item on this page (using its sort-assist fields)
    const nextCursor: string | null = hasMore && page.length > 0
      ? encodeCursor(page[page.length - 1])
      : null;

    // ── Strip sort-assist fields ──────────────────────────────────────────────
    const emitted = page.map(stripSortFields);

    return successResponse({
      alerts:                emitted,
      alertCount:            emitted.length,
      totalAlerts:           filtered.length,
      nextCursor,
      hasMore,
      windowDays,
      spikeThreshold,
      concentrationThreshold,
      limit,
      computedAt:            requestTime.toISOString(),
    });
  } catch (err) {
    console.error("GET /api/seo/alerts error:", err);
    return serverError();
  }
}
