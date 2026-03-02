/**
 * GET /api/seo/volatility-summary — SIL-4: Project Volatility Aggregation
 *
 * Aggregates volatility scores across all KeywordTargets in the current project.
 * Read-only. No writes. No EventLog. No schema changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ISOLATION MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Project scope is resolved exclusively via resolveProjectId(request), which
 * reads x-project-id or x-project-slug headers (or falls back to the default
 * project). All DB queries are scoped WHERE projectId = resolvedProjectId.
 * A request carrying headers for project B cannot see project A's data.
 * No projectId in the URL path.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ALGORITHM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. resolveProjectId(request) → projectId (400 on bad header, falls back to default).
 * 2. Load all KeywordTargets WHERE projectId (deterministic: createdAt asc, id asc).
 * 3. Load all SERPSnapshots WHERE projectId in ONE query (capturedAt asc, id asc).
 *    This is O(1) DB round-trips regardless of keyword count K.
 * 4. Group snapshots in memory by composite key "query\0locale\0device".
 *    \0 is safe: normalizeQuery() produces no null bytes.
 * 5. For each KeywordTarget call computeVolatility(snapshots) — pure function,
 *    zero I/O, identical to SIL-3 per-keyword surface.
 * 6. Aggregate into bucket counts and derived metrics.
 * 7. Return { data: { ... } }.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BUCKET DEFINITIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * stableCount        volatilityScore === 0   covers both sampleSize=0 (no
 *                                            snapshots yet) and genuinely
 *                                            unmoved keywords. Both are
 *                                            operationally "not alarming".
 *                                            Combining them keeps the bucket
 *                                            invariant (sum = keywordCount)
 *                                            without introducing a fifth bucket
 *                                            that would require schema or
 *                                            contract changes.
 * lowVolatilityCount    1 ≤ score < 30
 * mediumVolatilityCount 30 ≤ score < 60
 * highVolatilityCount   score ≥ 60
 *
 * Thresholds calibrated to RANK_SHIFT_CAP=20 used in the formula:
 *   score=30 ≈ average 6-position sustained drift  (noteworthy, monitor)
 *   score=60 ≈ average 12-position sustained drift (actionable, investigate)
 *
 * averageVolatility: mean over ALL keywords (including score=0).
 * Rationale: excluding zero-score keywords inflates the average and
 * misrepresents project-wide stability. A project with 100 dormant keywords
 * and 2 chaotic ones should not report an average of 75.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPLEXITY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DB:       O(K) KeywordTarget rows + O(K×S) SERPSnapshot rows, 2 queries total.
 * Memory:   O(K×S) for the snapshot map.
 * Compute:  O(K×S) pairwise delta work inside computeVolatility().
 *
 * At K=200 keywords, S=50 snapshots: 10,000 rows, ~9,800 pair comparisons.
 * This is acceptable for compute-on-read at Phase 1 scale.
 * Materialization becomes appropriate when K×S > ~50,000 or call rate > 10/min.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, successResponse } from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { computeVolatility } from "@/lib/seo/volatility-service";

const HIGH_THRESHOLD   = 60;
const MEDIUM_THRESHOLD = 30;
// low: 1 ≤ score < 30   stable: score === 0

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    // ── Load KeywordTargets ─────────────────────────────────────────────────
    const targets = await prisma.keywordTarget.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, query: true, locale: true, device: true },
    });

    const keywordCount = targets.length;

    if (keywordCount === 0) {
      return successResponse({
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

    // ── Load all snapshots for the project in one query ─────────────────────
    const allSnapshots = await prisma.sERPSnapshot.findMany({
      where: { projectId },
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
