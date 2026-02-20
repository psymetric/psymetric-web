/**
 * POST /api/draft-artifacts/[id]/promote
 *
 * Phase 2 promotion path (Option B):
 * - Promotes a BYDA-S S0 audit DraftArtifact into canonical metrics on the referenced Entity.
 * - Creates 3 MetricSnapshot rows (geo_* metrics) and archives the draft.
 * - All mutations + EventLog entries occur inside prisma.$transaction().
 * - Project-scoped via resolveProjectId() only.
 * - Read-time TTL enforcement: draft must not be expired.
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
import {
  ActorType,
  ContentEntityType,
  DraftArtifactKind,
  DraftArtifactStatus,
  EntityType,
  EventType,
  MetricType,
  Platform,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_KIND = DraftArtifactKind.byda_s_audit;
const BYDA_S0_SCHEMA_VERSION = "byda.s0.v1";

type S0AuditContent = {
  schemaVersion: string;
  entityId: string;
  scores: {
    citability: number;
    extractability: number;
    factualDensity: number;
  };
  notes?: string;
  createdAt: string;
};

function mapContentEntityTypeToEntityType(t: ContentEntityType): EntityType {
  switch (t) {
    case ContentEntityType.guide:
      return EntityType.guide;
    case ContentEntityType.concept:
      return EntityType.concept;
    case ContentEntityType.project:
      return EntityType.project;
    case ContentEntityType.news:
      return EntityType.news;
  }
}

function parseS0Content(
  raw: string
): { ok: true; value: S0AuditContent } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Draft content is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Draft content must be a JSON object" };
  }

  const c = parsed as Record<string, unknown>;

  if (c.schemaVersion !== BYDA_S0_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Draft content.schemaVersion must be "${BYDA_S0_SCHEMA_VERSION}"`,
    };
  }

  if (typeof c.entityId !== "string" || !UUID_RE.test(c.entityId)) {
    return { ok: false, error: "Draft content.entityId must be a valid UUID" };
  }

  if (typeof c.scores !== "object" || c.scores === null || Array.isArray(c.scores)) {
    return { ok: false, error: "Draft content.scores must be an object" };
  }

  const scores = c.scores as Record<string, unknown>;
  const citability = scores.citability;
  const extractability = scores.extractability;
  const factualDensity = scores.factualDensity;

  for (const [k, v] of Object.entries({
    citability,
    extractability,
    factualDensity,
  })) {
    if (typeof v !== "number") {
      return { ok: false, error: `Draft content.scores.${k} must be a number` };
    }
    if (v < 0 || v > 100) {
      return {
        ok: false,
        error: `Draft content.scores.${k} must be between 0 and 100`,
      };
    }
  }

  if (c.notes !== undefined && typeof c.notes !== "string") {
    return {
      ok: false,
      error: "Draft content.notes must be a string if provided",
    };
  }

  if (typeof c.createdAt !== "string") {
    return { ok: false, error: "Draft content.createdAt must be a string" };
  }

  return {
    ok: true,
    value: {
      schemaVersion: c.schemaVersion as string,
      entityId: c.entityId as string,
      scores: {
        citability: citability as number,
        extractability: extractability as number,
        factualDensity: factualDensity as number,
      },
      notes: c.notes as string | undefined,
      createdAt: c.createdAt as string,
    },
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    const now = new Date();

    const draft = await prisma.draftArtifact.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        kind: true,
        status: true,
        content: true,
        entityId: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    // Non-disclosure: treat missing or cross-project as 404.
    if (!draft || draft.projectId !== projectId) {
      return notFound("Draft artifact not found");
    }

    if (draft.deletedAt) {
      return notFound("Draft artifact not found");
    }

    if (draft.kind !== ALLOWED_KIND) {
      return badRequest(`Draft kind must be "${ALLOWED_KIND}"`);
    }

    if (draft.status !== DraftArtifactStatus.draft) {
      return badRequest("Draft artifact must be in 'draft' status to promote");
    }

    // TTL guard: expired drafts cannot be promoted.
    if (draft.expiresAt < now) {
      return badRequest("Draft artifact is expired and cannot be promoted");
    }

    const content = parseS0Content(draft.content);
    if (!content.ok) {
      return badRequest(content.error);
    }

    // DraftArtifact.entityId is optional in schema; for byda_s_audit it must exist and match content.
    if (!draft.entityId) {
      return badRequest("Draft artifact is missing entityId");
    }

    if (draft.entityId !== content.value.entityId) {
      return badRequest("Draft artifact entityId does not match content.entityId");
    }

    // Verify the referenced entity exists and belongs to this project.
    const entity = await prisma.entity.findUnique({
      where: { id: draft.entityId },
      select: { id: true, projectId: true, entityType: true },
    });

    if (!entity || entity.projectId !== projectId) {
      return notFound("Entity not found");
    }

    const promotedEntityType = mapContentEntityTypeToEntityType(entity.entityType);

    const result = await prisma.$transaction(async (tx) => {
      const capturedAt = now;

      const details: Prisma.InputJsonObject = {
        source: "draft_artifact_promote",
        draftArtifactId: draft.id,
        schemaVersion: BYDA_S0_SCHEMA_VERSION,
      };

      const snapshots = await Promise.all([
        tx.metricSnapshot.create({
          data: {
            metricType: MetricType.geo_citability_score,
            value: content.value.scores.citability,
            platform: Platform.other,
            capturedAt,
            entityType: entity.entityType,
            entityId: entity.id,
            notes: content.value.notes ?? null,
            projectId,
          },
          select: { id: true },
        }),
        tx.metricSnapshot.create({
          data: {
            metricType: MetricType.geo_extractability_score,
            value: content.value.scores.extractability,
            platform: Platform.other,
            capturedAt,
            entityType: entity.entityType,
            entityId: entity.id,
            notes: content.value.notes ?? null,
            projectId,
          },
          select: { id: true },
        }),
        tx.metricSnapshot.create({
          data: {
            metricType: MetricType.geo_factual_density,
            value: content.value.scores.factualDensity,
            platform: Platform.other,
            capturedAt,
            entityType: entity.entityType,
            entityId: entity.id,
            notes: content.value.notes ?? null,
            projectId,
          },
          select: { id: true },
        }),
      ]);

      // Archive draft.
      await tx.draftArtifact.update({
        where: { id: draft.id },
        data: { status: DraftArtifactStatus.archived },
        select: { id: true },
      });

      // Event logs: metric snapshots + draft archived + entity update
      await tx.eventLog.createMany({
        data: snapshots.map((s) => ({
          eventType: EventType.METRIC_SNAPSHOT_RECORDED,
          entityType: EntityType.metricSnapshot,
          entityId: s.id,
          actor: ActorType.system,
          projectId,
          details,
        })),
      });

      await tx.eventLog.create({
        data: {
          eventType: EventType.ENTITY_ARCHIVED,
          entityType: EntityType.draftArtifact,
          entityId: draft.id,
          actor: ActorType.system,
          projectId,
          details,
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: EventType.ENTITY_UPDATED,
          entityType: promotedEntityType,
          entityId: entity.id,
          actor: ActorType.system,
          projectId,
          details,
        },
      });

      return {
        draftArtifactId: draft.id,
        entityId: entity.id,
        metricSnapshotIds: snapshots.map((s) => s.id),
      };
    });

    return successResponse({
      draftArtifactId: result.draftArtifactId,
      entityId: result.entityId,
      metricSnapshotIds: result.metricSnapshotIds,
    });
  } catch (err) {
    console.error("POST /api/draft-artifacts/[id]/promote error:", err);
    return serverError();
  }
}
