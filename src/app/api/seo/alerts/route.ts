/**
 * GET /api/seo/alerts — SIL-9 Option A: Compute-on-Read Alert Surface (MVP T1–T3)
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
 *   windowDays            required   integer 1–30
 *   spikeThreshold        optional   float 0–100, default 75.00
 *   concentrationThreshold optional  float 0–1,   default 0.80
 *   limit                 optional   integer 1–200, default 100
 *
 * Deterministic ordering (per SIL-9 spec):
 *   1. severityRank DESC  (derived from trigger type + regime transition map)
 *   2. toCapturedAt DESC  (for keyword alerts; for T3 = latestCapturedAt in window)
 *   3. triggerType ASC
 *   4. keywordTargetId ASC (nulls last)
 *   5. toSnapshotId DESC  (nulls last)
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
    // → chaotic
    return jump >= 3 ? 5 : jump === 2 ? 5 : 4; // calm→chaotic or shifting→chaotic = 5, unstable→chaotic = 4
  }
  if (to === 2) {
    // → unstable
    return jump === 2 ? 4 : 3; // calm→unstable = 4, shifting→unstable = 3
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
  triggerType:                 "T3";
  projectId:                   string;
  volatilityConcentrationRatio: number;
  threshold:                   number;
  top3RiskKeywords:            Array<{
    keywordTargetId: string;
    query:           string;
    volatilityScore: number;
    volatilityRegime: VolatilityRegime;
  }>;
  activeKeywordCount: number;
  // sort-assist (latestCapturedAt in window, used as toCapturedAt equivalent)
  _severityRank:      number;
  _toCapturedAtMs:    number;
  _toSnapshotId:      null;
  _keywordTargetId:   null;
}

type AnyAlert = T1Alert | T2Alert | T3Alert;

// Emitted shapes (sort-assist fields stripped)
type T1Emitted  = Omit<T1Alert, "_severityRank" | "_toCapturedAtMs" | "_toSnapshotId" | "_keywordTargetId">;
type T2Emitted  = Omit<T2Alert, "_severityRank" | "_toCapturedAtMs" | "_toSnapshotId" | "_keywordTargetId">;
type T3Emitted  = Omit<T3Alert, "_severityRank" | "_toCapturedAtMs" | "_toSnapshotId" | "_keywordTargetId">;
type AlertEmitted = T1Emitted | T2Emitted | T3Emitted;

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

// =============================================================================
// Deterministic sort comparator
//
// Order (per SIL-9 spec):
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
    return 1; // a goes after b
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
// Strip sort-assist fields before returning to client
// =============================================================================

function stripSortFields(alert: AnyAlert): AlertEmitted {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _severityRank, _toCapturedAtMs, _toSnapshotId, _keywordTargetId, ...emitted } = alert;
  return emitted as AlertEmitted;
}

// =============================================================================
// GET /api/seo/alerts
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const sp = new URL(request.url).searchParams;

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

    // Single requestTime anchor — all window boundaries derived here.
    // Alert trigger conditions are functions of snapshot rows only.
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

    // ── Collect alerts ────────────────────────────────────────────────────────
    const alerts: AnyAlert[] = [];

    // T2 dedup key set: (keywordTargetId, toSnapshotId, threshold)
    const t2DedupSet = new Set<string>();

    // B2 accumulators for T3
    let activeKeywordCount   = 0;
    let totalVolatilitySum   = 0;
    interface ActiveRecord {
      keywordTargetId: string;
      query:           string;
      volatilityScore: number;
    }
    const activeRecords: ActiveRecord[] = [];

    for (const target of targets) {
      const key  = `${target.query}\0${target.locale}\0${target.device}`;
      const snaps = snapshotMap.get(key) ?? [];

      // Need at least 2 snapshots for any pair-based trigger
      if (snaps.length < 2) {
        // Still accumulate for T3 (sampleSize=0, score=0 — but that means not active)
        continue;
      }

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

      // Keyword-level volatility for T3 B2 accumulation
      // Use computeVolatility across all pairs (pass all snaps)
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
      // Compare last pair regime vs second-to-last pair regime.
      // Requires >= 2 pairs (>= 3 snapshots).
      if (pairs.length >= 2) {
        const lastPair = pairs[pairs.length - 1];
        const prevPair = pairs[pairs.length - 2];
        if (lastPair.regime !== prevPair.regime) {
          const fromRegime = prevPair.regime;
          const toRegime   = lastPair.regime;
          const sevRank    = t1SeverityRank(fromRegime, toRegime);
          alerts.push({
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
      // Emit for each pair where pairVolatilityScore > spikeThreshold.
      // Dedup within response by (keywordTargetId, toSnapshotId, threshold).
      for (const pair of pairs) {
        if (pair.pairVolatilityScore > spikeThreshold) {
          const dedupKey = `${target.id}\0${pair.toSnapshotId}\0${spikeThreshold}`;
          if (!t2DedupSet.has(dedupKey)) {
            t2DedupSet.add(dedupKey);
            const exceedanceMargin = Math.round((pair.pairVolatilityScore - spikeThreshold) * 100) / 100;
            alerts.push({
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
    // Compute concentration ratio using B2 formula.
    // Emitted at most once per request.
    let volatilityConcentrationRatio: number | null = null;
    if (totalVolatilitySum > 0) {
      // Sort for top3: volatilityScore DESC, query ASC, keywordTargetId ASC
      activeRecords.sort((a, b) => {
        if (b.volatilityScore !== a.volatilityScore) return b.volatilityScore - a.volatilityScore;
        const qCmp = a.query.localeCompare(b.query);
        if (qCmp !== 0) return qCmp;
        return a.keywordTargetId.localeCompare(b.keywordTargetId);
      });
      const top3 = activeRecords.slice(0, 3);
      const top3Sum = top3.reduce((acc, r) => acc + r.volatilityScore, 0);
      volatilityConcentrationRatio = Math.round((top3Sum / totalVolatilitySum) * 10000) / 10000;

      if (volatilityConcentrationRatio > concentrationThreshold) {
        const top3RiskKeywords = top3.map((r) => ({
          keywordTargetId: r.keywordTargetId,
          query:           r.query,
          volatilityScore: r.volatilityScore,
          volatilityRegime: classifyRegime(r.volatilityScore),
        }));
        alerts.push({
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
    // If totalVolatilitySum = 0 → ratio is null → no T3 alert (null guard per spec)

    // ── Sort deterministically ────────────────────────────────────────────────
    alerts.sort(compareAlerts);

    // ── Apply limit ───────────────────────────────────────────────────────────
    const page = alerts.slice(0, limit);

    // ── Strip sort-assist fields ──────────────────────────────────────────────
    const emitted = page.map(stripSortFields);

    return successResponse({
      alerts:                   emitted,
      alertCount:               emitted.length,
      totalAlerts:              alerts.length,
      windowDays,
      spikeThreshold,
      concentrationThreshold,
      limit,
      computedAt:               requestTime.toISOString(),
    });
  } catch (err) {
    console.error("GET /api/seo/alerts error:", err);
    return serverError();
  }
}
