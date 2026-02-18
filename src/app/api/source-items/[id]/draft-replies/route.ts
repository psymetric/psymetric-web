/**
 * POST /api/source-items/[id]/draft-replies — Generate draft reply drafts
 * GET /api/source-items/[id]/draft-replies — List draft replies
 *
 * Option A (Tighten X Operator Loop), Phase 1 disciplined.
 * - Query params only: ?count=N&style=short|medium|thread
 * - No UI changes
 * - No schema changes
 * - No LLM integration (stub content only)
 *
 * Multi-project hardening:
 * - Project-scoped reads and writes
 * - No cross-project draft access
 * - Draft creation + event logging is atomic inside prisma.$transaction()
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  createdResponse,
  notFound,
  badRequest,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";

type DraftStyle = "short" | "medium" | "thread";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCount(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function isDraftStyle(value: unknown): value is DraftStyle {
  return value === "short" || value === "medium" || value === "thread";
}

function buildStubReply(args: {
  style: DraftStyle;
  variantIndex: number;
  variantCount: number;
  sourceUrl: string;
}): string {
  const { style, variantIndex, variantCount, sourceUrl } = args;
  const v = variantCount > 1 ? ` (v${variantIndex + 1}/${variantCount})` : "";

  // Phase 1 stub content only. Keep it simple and copy-friendly.
  if (style === "short") {
    return `Good thread${v}. What do you think is the single biggest practical takeaway?\n\n${sourceUrl}`;
  }

  if (style === "thread") {
    // Single content blob; operator may split into multiple posts manually.
    return [
      `1/4 Quick take${v}: interesting signal — especially for tracking what actually ships.`,
      `2/4 The question is always constraints: latency, cost, evals, and incentives.`,
      `3/4 If you have real numbers, that’s the gold. If not, what would you measure next?`,
      `4/4 Curious where you think the hard part is hiding.\n\n${sourceUrl}`,
    ].join("\n\n");
  }

  // medium
  return [
    `Interesting${v}. The practical question is: what changes in behavior once this exists?`,
    `What’s the cleanest test to separate hype from impact?`,
    "",
    sourceUrl,
  ].join("\n");
}

// =============================================================================
// POST /api/source-items/[id]/draft-replies
// Query params:
// - count=N (1–5 variants, default 1)
// - style=short|medium|thread (default short)
// =============================================================================

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const { id } = await context.params;

    if (!id || !UUID_RE.test(id)) {
      return badRequest("Invalid id parameter");
    }

    const sourceItem = await prisma.sourceItem.findUnique({
      where: { id },
      select: { id: true, url: true, platform: true, projectId: true },
    });

    if (!sourceItem || sourceItem.projectId !== projectId) {
      return notFound("Source item not found");
    }

    // Phase 1 invariant: only X reply drafts are supported.
    if (sourceItem.platform !== "x") {
      return badRequest("Draft replies are only supported for X source items");
    }

    // --- Inputs (query params only; Phase 1 tight + boring) ---
    const url = new URL(request.url);
    const qCount = url.searchParams.get("count");
    const qStyle = url.searchParams.get("style");

    const parsedCount = parseCount(qCount);
    const count = parsedCount ?? 1;
    if (count < 1 || count > 5) {
      return badRequest("count must be an integer between 1 and 5");
    }

    const styleRaw = qStyle ?? "short";
    if (!isDraftStyle(styleRaw)) {
      return badRequest("style must be one of: short, medium, thread");
    }
    const style: DraftStyle = styleRaw;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // --- Create draft variants + event log atomically ---
    const draftIds = await prisma.$transaction(async (tx) => {
      const drafts = await Promise.all(
        Array.from({ length: count }).map((_, i) =>
          tx.draftArtifact.create({
            data: {
              kind: "x_reply",
              status: "draft",
              content: buildStubReply({
                style,
                variantIndex: i,
                variantCount: count,
                sourceUrl: sourceItem.url,
              }),
              sourceItemId: id,
              entityId: null,
              createdBy: "llm",
              // Prisma Json? fields should be omitted when unknown/null.
              // llmModel and llmMeta can be populated later when a real LLM integration exists.
              expiresAt,
              deletedAt: null,
              projectId,
            },
          })
        )
      );

      const ids = drafts.map((d) => d.id);

      await tx.eventLog.create({
        data: {
          eventType: "DRAFT_CREATED",
          entityType: "sourceItem",
          entityId: sourceItem.id,
          actor: "llm",
          projectId,
          details: {
            draftIds: ids,
            count,
            style,
          },
        },
      });

      return ids;
    });

    return createdResponse({
      draftIds,
      ...(draftIds.length === 1 ? { draftId: draftIds[0] } : {}),
      count,
      style,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/source-items/[id]/draft-replies error:", error);
    return serverError();
  }
}

// =============================================================================
// GET /api/source-items/[id]/draft-replies
// =============================================================================

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const { id } = await context.params;

    if (!id || !UUID_RE.test(id)) {
      return badRequest("Invalid id parameter");
    }

    const sourceItem = await prisma.sourceItem.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!sourceItem || sourceItem.projectId !== projectId) {
      return notFound("Source item not found");
    }

    const drafts = await prisma.draftArtifact.findMany({
      where: {
        sourceItemId: id,
        projectId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return successResponse(drafts);
  } catch (error) {
    console.error("GET /api/source-items/[id]/draft-replies error:", error);
    return serverError();
  }
}
