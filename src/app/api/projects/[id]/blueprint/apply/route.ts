/**
 * POST /api/projects/:id/blueprint/apply — Apply the active blueprint
 *
 * Materializes the approved blueprint into foundational Content Graph records.
 *
 * Bounded apply scope:
 *   - CgSurface       from surfaceRegistry
 *   - CgSite          from websiteArchitecture (only if website surface + domain)
 *   - CgContentArchetype from contentArchetypes
 *   - CgTopic         from entityClusters (no entityType or entityType="topic")
 *   - CgEntity        from entityClusters (entityType present and != "topic")
 *
 * Explicitly NOT created by apply:
 *   - KeywordTarget   (requires explicit operator action per spec)
 *   - CgPage          (created during content development)
 *   - CgInternalLink  (created during content development)
 *   - CgSchemaUsage   (created during content development)
 *   - CgPageTopic     (created during content development)
 *   - CgPageEntity    (created during content development)
 *
 * Invariants:
 *   - All writes inside prisma.$transaction()
 *   - Emits BLUEPRINT_APPLIED EventLog with created counts
 *   - Blueprint archived after apply
 *   - Idempotent: skips records that already exist
 *   - 400 if no active blueprint
 *   - 404 if project not found
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { UUID_RE } from "@/lib/constants";
import { BlueprintContentSchema, type BlueprintContent } from "@/lib/schemas/project";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
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

    // Retrieve active blueprint
    const blueprintRecord = await prisma.draftArtifact.findFirst({
      where: {
        projectId: id,
        kind: "project_blueprint",
        status: "draft",
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (!blueprintRecord) {
      return badRequest("No active blueprint to apply. Propose a blueprint first.");
    }

    // Validate stored content
    let rawContent: unknown;
    try {
      rawContent = typeof blueprintRecord.content === "string"
        ? JSON.parse(blueprintRecord.content)
        : blueprintRecord.content;
    } catch {
      return badRequest("Blueprint content is corrupt. Re-propose the blueprint.");
    }

    const parsed = BlueprintContentSchema.safeParse(rawContent);
    if (!parsed.success) {
      return badRequest("Blueprint content is invalid. Re-propose the blueprint.");
    }

    const content: BlueprintContent = parsed.data;

    // Atomic apply
    const result = await prisma.$transaction(async (tx) => {
      const created = {
        surfaces: 0,
        sites: 0,
        archetypes: 0,
        topics: 0,
        entities: 0,
      };

      // ── CgSurface from surfaceRegistry ──────────────────────────────────
      for (const surface of content.surfaceRegistry) {
        const existing = await tx.cgSurface.findUnique({
          where: { projectId_key: { projectId: id, key: surface.key } },
          select: { id: true },
        });
        if (!existing) {
          await tx.cgSurface.create({
            data: {
              projectId: id,
              type: surface.type,
              key: surface.key,
              label: surface.label ?? null,
              enabled: true,
            },
          });
          created.surfaces++;
        }
      }

      // ── CgSite from websiteArchitecture (if website surface + domain) ──
      if (content.websiteArchitecture?.domain) {
        const websiteSurface = await tx.cgSurface.findFirst({
          where: { projectId: id, type: "website" },
          select: { id: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

        if (websiteSurface) {
          const existingSite = await tx.cgSite.findUnique({
            where: {
              projectId_domain: {
                projectId: id,
                domain: content.websiteArchitecture.domain,
              },
            },
            select: { id: true },
          });
          if (!existingSite) {
            await tx.cgSite.create({
              data: {
                projectId: id,
                surfaceId: websiteSurface.id,
                domain: content.websiteArchitecture.domain,
                framework: content.websiteArchitecture.framework ?? null,
                isCanonical: true,
                notes: content.websiteArchitecture.notes ?? null,
              },
            });
            created.sites++;
          }
        }
      }

      // ── CgContentArchetype from contentArchetypes ───────────────────────
      if (content.contentArchetypes) {
        for (const arch of content.contentArchetypes) {
          const existing = await tx.cgContentArchetype.findUnique({
            where: { projectId_key: { projectId: id, key: arch.key } },
            select: { id: true },
          });
          if (!existing) {
            await tx.cgContentArchetype.create({
              data: {
                projectId: id,
                key: arch.key,
                label: arch.label,
              },
            });
            created.archetypes++;
          }
        }
      }

      // ── entityClusters → CgTopic or CgEntity ───────────────────────────
      if (content.entityClusters) {
        for (const cluster of content.entityClusters) {
          const isEntity = cluster.entityType && cluster.entityType !== "topic";

          if (isEntity) {
            const existing = await tx.cgEntity.findUnique({
              where: { projectId_key: { projectId: id, key: cluster.key } },
              select: { id: true },
            });
            if (!existing) {
              await tx.cgEntity.create({
                data: {
                  projectId: id,
                  key: cluster.key,
                  label: cluster.label,
                  entityType: cluster.entityType!,
                },
              });
              created.entities++;
            }
          } else {
            const existing = await tx.cgTopic.findUnique({
              where: { projectId_key: { projectId: id, key: cluster.key } },
              select: { id: true },
            });
            if (!existing) {
              await tx.cgTopic.create({
                data: {
                  projectId: id,
                  key: cluster.key,
                  label: cluster.label,
                },
              });
              created.topics++;
            }
          }
        }
      }

      // ── Archive blueprint ───────────────────────────────────────────────
      await tx.draftArtifact.update({
        where: { id: blueprintRecord.id },
        data: { status: "archived" },
      });

      // ── EventLog ────────────────────────────────────────────────────────
      await tx.eventLog.create({
        data: {
          eventType: "BLUEPRINT_APPLIED",
          entityType: "vedaProject",
          entityId: id,
          actor: "human",
          projectId: id,
          details: {
            blueprintId: blueprintRecord.id,
            created,
          },
        },
      });

      return created;
    });

    return successResponse({
      projectId: id,
      blueprintId: blueprintRecord.id,
      applied: true,
      created: result,
    });
  } catch (error) {
    console.error("POST /api/projects/:id/blueprint/apply error:", error);
    return serverError();
  }
}
