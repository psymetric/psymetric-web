/**
 * POST /api/source-items/[id]/draft-replies — Generate draft reply drafts
 * GET /api/source-items/[id]/draft-replies — List draft replies
 *
 * Option A (Tighten X Operator Loop), Phase 1 disciplined.
 * - Query params only: ?count=N&style=short|medium|thread
 * - No UI changes
 * - No schema changes
 * - No LLM integration (stub content only)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  createdResponse,
  notFound,
  badRequest,
  errorResponse,
  serverError,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";

type DraftStyle = "short" | "medium" | "thread";

type DraftCreatedDetails = {
  draftIds?: unknown;
  count?: unknown;
  style?: unknown;
};

function parseCount(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function isDraftStyle(value: unknown): value is DraftStyle {
  return value === "short" || value === "medium" || value === "thread";
}

function extractDraftIds(details: unknown): string[] | null {
  if (!details || typeof details !== "object") return null;
  const d = details as DraftCreatedDetails;
  if (!Array.isArray(d.draftIds)) return null;
  const ids = d.draftIds.filter((x): x is string => typeof x === "string");
  return ids.length > 0 ? ids : null;
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
      `2/4 The question is always constraints: latency, cost, evals, and the incentives around deployment.`,
      `3/4 If you have real numbers, that’s the gold. If not, what would you measure next?`,
      `4/4 Curious where you think the “hard part” is hiding.\n\n${sourceUrl}`,
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
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
    }

    const sourceItem = await prisma.sourceItem.findUnique({
      where: { id },
    });

    if (!sourceItem) {
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

    // --- Tighten bolts: rate-limit + idempotency guard using EventLog ---
    // Serverless-safe (DB-backed): avoid accidental double-click spam.
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    const recent = await prisma.eventLog.findMany({
      where: {
        eventType: "DRAFT_CREATED",
        entityType: "sourceItem",
        entityId: sourceItem.id,
        timestamp: { gte: oneMinuteAgo },
      },
      orderBy: { timestamp: "desc" },
      take: 5,
    });

    // Idempotency: if the most recent generation matches the requested shape and is very recent,
    // return its draftIds instead of creating duplicates.
    const mostRecent = recent[0];
    if (mostRecent) {
      const ageMs = now.getTime() - mostRecent.timestamp.getTime();
      const details = (mostRecent.details ?? {}) as unknown;
      const d = details as DraftCreatedDetails;

      const matchesShape = d?.count === count && d?.style === style;
      const recentEnough = ageMs >= 0 && ageMs <= 10_000; // 10s window
      const priorDraftIds = extractDraftIds(details);

      if (recentEnough && matchesShape && priorDraftIds) {
        const first = await prisma.draftArtifact.findUnique({
          where: { id: priorDraftIds[0] },
          select: { expiresAt: true },
        });

        return createdResponse({
          draftIds: priorDraftIds,
          ...(priorDraftIds.length === 1 ? { draftId: priorDraftIds[0] } : {}),
          count,
          style,
          expiresAt: (first?.expiresAt ?? now).toISOString(),
        });
      }

      // Rate limit: cap draft generations per SourceItem to reduce accidental spam.
      // (Operator can still intentionally generate again after a short wait.)
      if (recent.length >= 3) {
        return errorResponse(
          "RATE_LIMITED",
          "Too many draft generations for this source item. Try again in a minute.",
          429
        );
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // --- Create draft variants (N rows) ---
    const drafts = await prisma.$transaction(
      Array.from({ length: count }).map((_, i) =>
        prisma.draftArtifact.create({
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
          },
        })
      )
    );

    // Internal invariant assertion (defensive): transaction should create exactly N.
    if (drafts.length !== count) {
      console.error(
        "Invariant violation: draft count mismatch",
        JSON.stringify({ requested: count, created: drafts.length, sourceItemId: id })
      );
      return serverError("Draft generation failed");
    }

    const draftIds = drafts.map((d) => d.id);

    // --- Event: single DRAFT_CREATED with batch metadata ---
    await logEvent({
      eventType: "DRAFT_CREATED",
      entityType: "sourceItem",
      entityId: sourceItem.id,
      actor: "llm",
      details: {
        draftIds,
        count,
        style,
      },
    });

    // Keep response minimal and backwards-friendly.
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
    const { id } = await context.params;

    if (!id || typeof id !== "string") {
      return badRequest("Invalid id parameter");
    }

    const drafts = await prisma.draftArtifact.findMany({
      where: {
        sourceItemId: id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return successResponse(drafts);
  } catch (error) {
    console.error("GET /api/source-items/[id]/draft-replies error:", error);
    return serverError();
  }
}
