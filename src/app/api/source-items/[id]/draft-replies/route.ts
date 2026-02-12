/**
 * POST /api/source-items/[id]/draft-replies — Generate draft reply
 * GET /api/source-items/[id]/draft-replies — List draft replies
 *
 * Per docs/ROADMAP.md Phase 1 Draft System requirements
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
import { logEvent } from "@/lib/events";

// =============================================================================
// POST /api/source-items/[id]/draft-replies
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

    const generatedReply = "Draft reply based on captured content.";

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const draftArtifact = await prisma.draftArtifact.create({
      data: {
        kind: "x_reply",
        status: "draft",
        content: generatedReply,
        sourceItemId: id,
        entityId: null,
        createdBy: "llm",
        // Prisma Json? fields should be omitted when unknown/null.
        // llmModel and llmMeta can be populated later when a real LLM integration exists.
        expiresAt,
        deletedAt: null,
      },
    });

    await logEvent({
      eventType: "DRAFT_CREATED",
      entityType: "sourceItem",
      entityId: sourceItem.id,
      actor: "llm",
      details: {
        draftId: draftArtifact.id,
      },
    });

    return createdResponse({
      draftId: draftArtifact.id,
      content: draftArtifact.content,
      expiresAt: draftArtifact.expiresAt.toISOString(),
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
