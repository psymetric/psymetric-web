/**
 * POST /api/projects/:id/blueprint — Propose a project blueprint
 * GET  /api/projects/:id/blueprint — Get the current active blueprint
 *
 * Blueprints are stored as DraftArtifact records (kind=project_blueprint).
 * Only one active (status=draft, deletedAt=null) blueprint per project.
 *
 * POST:
 *   - Validates blueprint content against BlueprintContentSchema (Zod.strict())
 *   - Archives any existing active blueprint
 *   - Creates new DraftArtifact
 *   - Emits BLUEPRINT_PROPOSED EventLog
 *   - Transitions lifecycle: created → draft (only on first proposal)
 *   - All writes inside prisma.$transaction()
 *
 * GET:
 *   - Returns latest active blueprint
 *   - 404 if none exists
 *   - Deterministic retrieval: createdAt desc, id desc
 *
 * Does NOT mutate downstream state. Proposal is a planning artifact only.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  createdResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { UUID_RE } from "@/lib/constants";
import { ProposeBlueprintSchema } from "@/lib/schemas/project";
import { formatZodErrors } from "@/lib/zod-helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!UUID_RE.test(id)) {
      return badRequest("Project ID must be a valid UUID");
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true, lifecycleState: true },
    });
    if (!project) {
      return notFound("Not found");
    }

    const blueprint = await prisma.draftArtifact.findFirst({
      where: {
        projectId: id,
        kind: "project_blueprint",
        status: "draft",
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (!blueprint) {
      return notFound("No active blueprint for this project");
    }

    // Content is stored as JSON string; parse for the response
    let content: unknown;
    try {
      content = typeof blueprint.content === "string"
        ? JSON.parse(blueprint.content)
        : blueprint.content;
    } catch {
      content = blueprint.content;
    }

    return successResponse({
      projectId: id,
      projectName: project.name,
      lifecycleState: project.lifecycleState,
      blueprint: {
        id: blueprint.id,
        content,
        schemaVersion: blueprint.schemaVersion,
        llmModel: blueprint.llmModel,
        createdBy: blueprint.createdBy,
        createdAt: blueprint.createdAt,
        updatedAt: blueprint.updatedAt,
      },
    });
  } catch (error) {
    console.error("GET /api/projects/:id/blueprint error:", error);
    return serverError();
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!UUID_RE.test(id)) {
      return badRequest("Project ID must be a valid UUID");
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, lifecycleState: true },
    });
    if (!project) {
      return notFound("Not found");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON");
    }

    const parsed = ProposeBlueprintSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("Validation failed", formatZodErrors(parsed.error));
    }

    const { content, llmModel } = parsed.data;

    // Blueprint expiry: 90 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const result = await prisma.$transaction(async (tx) => {
      // Archive any existing active blueprint for this project
      await tx.draftArtifact.updateMany({
        where: {
          projectId: id,
          kind: "project_blueprint",
          status: "draft",
          deletedAt: null,
        },
        data: { status: "archived" },
      });

      // Create new blueprint proposal
      const blueprint = await tx.draftArtifact.create({
        data: {
          kind: "project_blueprint",
          status: "draft",
          content: JSON.stringify(content),
          schemaVersion: "blueprint.v1",
          source: "operator",
          createdBy: llmModel ? "llm" : "human",
          llmModel: llmModel ?? null,
          expiresAt,
          projectId: id,
        },
      });

      // EventLog
      await tx.eventLog.create({
        data: {
          eventType: "BLUEPRINT_PROPOSED",
          entityType: "vedaProject",
          entityId: id,
          actor: llmModel ? "llm" : "human",
          projectId: id,
          details: {
            blueprintId: blueprint.id,
            schemaVersion: "blueprint.v1",
            llmModel: llmModel ?? null,
          },
        },
      });

      // Lifecycle: created → draft on first proposal
      if (project.lifecycleState === "created") {
        await tx.project.update({
          where: { id },
          data: { lifecycleState: "draft" },
        });
      }

      return blueprint;
    });

    return createdResponse({
      projectId: id,
      blueprint: {
        id: result.id,
        content,
        schemaVersion: "blueprint.v1",
        createdAt: result.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/projects/:id/blueprint error:", error);
    return serverError();
  }
}
