/**
 * GET /api/seo/keyword-targets/:id/volatility — SIL-3 Keyword Volatility Aggregation
 *
 * Computes a rolling volatility profile for a KeywordTarget from its historical
 * SERPSnapshot deltas. This is a compute-on-read, read-only surface.
 *
 * Algorithm:
 *   1. Load all SERPSnapshots for (projectId, query, locale, device), ordered
 *      capturedAt ASC, id ASC (deterministic).
 *   2. Compute pairwise deltas between each consecutive snapshot pair (N-1 pairs).
 *   3. Aggregate into volatility metrics (see volatility-service.ts for formula).
 *
 * Constraints:
 *   - No DB writes. No EventLog. Read-only surface.
 *   - Project-scoped (404 non-disclosure on cross-project access).
 *   - sampleSize = number of consecutive snapshot pairs evaluated (= snapshotCount - 1).
 *   - sampleSize=0 if fewer than 2 snapshots exist.
 *   - Deterministic: same snapshot set always produces identical output.
 *   - 400 for invalid UUID.
 *   - 404 for missing or cross-project keywordTarget.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  notFound,
  serverError,
  successResponse,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { computeVolatility } from "@/lib/seo/volatility-service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteParams = { id: string };

function isPromise<T>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as any).then === "function";
}

export async function GET(
  request: NextRequest,
  { params }: { params: RouteParams | Promise<RouteParams> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    // Next.js App Router params may be a Promise depending on Next version.
    // Support both to avoid returning 400 for valid UUIDs.
    const resolvedParams = isPromise<RouteParams>(params) ? await params : params;
    const id = resolvedParams?.id;

    // --- Validate UUID format ---
    if (!id || !UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // --- Resolve KeywordTarget (project-scoped, 404 non-disclosure) ---
    const keywordTarget = await prisma.keywordTarget.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        query: true,
        locale: true,
        device: true,
      },
    });

    if (!keywordTarget || keywordTarget.projectId !== projectId) {
      return notFound("KeywordTarget not found");
    }

    const { query, locale, device } = keywordTarget;

    // --- Load all snapshots for this target: ASC for pairwise delta computation ---
    // rawPayload is required for rank extraction in the volatility service.
    const snapshots = await prisma.sERPSnapshot.findMany({
      where: { projectId, query, locale, device },
      orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        capturedAt: true,
        aiOverviewStatus: true,
        rawPayload: true,
      },
    });

    // --- Compute volatility (pure function, no DB writes) ---
    const volatility = computeVolatility(snapshots);

    return successResponse({
      keywordTargetId: id,
      query,
      locale,
      device,
      sampleSize: volatility.sampleSize,
      snapshotCount: snapshots.length,
      averageRankShift: volatility.averageRankShift,
      maxRankShift: volatility.maxRankShift,
      featureVolatility: volatility.featureVolatility,
      aiOverviewChurn: volatility.aiOverviewChurn,
      volatilityScore: volatility.volatilityScore,
      computedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /api/seo/keyword-targets/:id/volatility error:", err);
    return serverError();
  }
}
