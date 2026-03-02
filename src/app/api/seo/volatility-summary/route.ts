/**
 * GET /api/seo/volatility-summary — SIL-4: Project Volatility Aggregation
 *
 * Aggregates volatility scores across all KeywordTargets in the current project.
 * Read-only. No writes. No EventLog. No schema changes.
 *
 * windowDays:
 *   Optional integer query param (1–365). When supplied, only snapshots with
 *   capturedAt >= (requestTime - windowDays * 86400s) are included in the
 *   single batch snapshot query. The WHERE clause is applied in the DB, not
 *   in memory, so the capturedAt index is used.
 *   windowDays is echoed in the response. requestTime is fixed once at the
 *   top of the request handler.
 *
 * Isolation: resolveProjectId(request) — headers only, no URL path param.
 * Complexity: O(1) DB queries, O(K×S) memory + compute where S is the
 *   snapshot count within the window.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, successResponse } from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { computeVolatility } from "@/lib/seo/volatility-service";

const HIGH_THRESHOLD   = 60;
const MEDIUM_THRESHOLD = 30;

const WINDOW_DAYS_MIN = 1;
const WINDOW_DAYS_MAX = 365;

/**
 * Parse and validate the optional windowDays query param.
 * Shared validation logic mirrors the SIL-3 route — kept inline to avoid
 * a shared util file for two call sites. If a third endpoint needs this,
 * extract to lib/seo/window-param.ts.
 */
function parseWindowDays(
  searchParams: URLSearchParams
): { windowDays: number | null; error?: never } | { windowDays?: never; error: string } {
  const raw = searchParams.get("windowDays");
  if (raw === null) return { windowDays: null };
  if (!/^\d+$/.test(raw)) return { error: "windowDays must be an integer" };
  const n = parseInt(raw, 10);
  if (n < WINDOW_DAYS_MIN) return { error: `windowDays must be >= ${WINDOW_DAYS_MIN}` };
  if (n > WINDOW_DAYS_MAX) return { error: `windowDays must be <= ${WINDOW_DAYS_MAX}` };
  return { windowDays: n };
}

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const searchParams = new URL(request.url).searchParams;
    const windowResult = parseWindowDays(searchParams);
    if (windowResult.error) return badRequest(windowResult.error);
    const windowDays = windowResult.windowDays ?? null;

    // Fix requestTime once so the window boundary is stable for this request.
    const requestTime = new Date();
    const windowStart: Date | null = windowDays !== null
      ? new Date(requestTime.getTime() - windowDays * 24 * 60 * 60 * 1000)
      : null;

    // ── Load KeywordTargets ─────────────────────────────────────────────────
    const targets = await prisma.keywordTarget.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, query: true, locale: true, device: true },
    });

    const keywordCount = targets.length;

    if (keywordCount === 0) {
      return successResponse({
        windowDays,
        keywordCount: 0,
        activeKeywordCount: 0,
        averageVolatility: 0,
        maxVolatility: 0,
        highVolatilityCount: 0,
        mediumVolatilityCount: 0,
        lowVolatilityCount: 0,
        stableCount: 0,
      });
    }

    // ── Load all snapshots for the project in one query (window-filtered) ───
    const allSnapshots = await prisma.sERPSnapshot.findMany({
      where: {
        projectId,
        ...(windowStart !== null ? { capturedAt: { gte: windowStart } } : {}),
      },
      orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        query: true,
        locale: true,
        device: true,
        capturedAt: true,
        aiOverviewStatus: true,
        rawPayload: true,
      },
    });

    // ── Group snapshots by (query, locale, device) ──────────────────────────
    type SnapRow = {
      id: string;
      capturedAt: Date;
      aiOverviewStatus: string;
      rawPayload: unknown;
    };
    const snapshotMap = new Map<string, SnapRow[]>();

    for (const snap of allSnapshots) {
      const key = `${snap.query}\0${snap.locale}\0${snap.device}`;
      let bucket = snapshotMap.get(key);
      if (!bucket) { bucket = []; snapshotMap.set(key, bucket); }
      bucket.push({
        id: snap.id,
        capturedAt: snap.capturedAt,
        aiOverviewStatus: snap.aiOverviewStatus,
        rawPayload: snap.rawPayload,
      });
    }

    // ── Compute and aggregate ───────────────────────────────────────────────
    let activeKeywordCount  = 0;
    let highVolatilityCount   = 0;
    let mediumVolatilityCount = 0;
    let lowVolatilityCount    = 0;
    let stableCount           = 0;
    let maxVolatility         = 0;
    let volatilitySum         = 0;

    for (const target of targets) {
      const key = `${target.query}\0${target.locale}\0${target.device}`;
      const snapshots = snapshotMap.get(key) ?? [];
      const profile = computeVolatility(snapshots);

      if (profile.sampleSize >= 1) activeKeywordCount++;

      const score = profile.volatilityScore;
      volatilitySum += score;
      if (score > maxVolatility) maxVolatility = score;

      if (score >= HIGH_THRESHOLD)        highVolatilityCount++;
      else if (score >= MEDIUM_THRESHOLD) mediumVolatilityCount++;
      else if (score >= 1)                lowVolatilityCount++;
      else                                stableCount++;
    }

    const averageVolatility =
      Math.round((volatilitySum / keywordCount) * 100) / 100;

    return successResponse({
      windowDays,
      keywordCount,
      activeKeywordCount,
      averageVolatility,
      maxVolatility,
      highVolatilityCount,
      mediumVolatilityCount,
      lowVolatilityCount,
      stableCount,
    });
  } catch (err) {
    console.error("GET /api/seo/volatility-summary error:", err);
    return serverError();
  }
}
