/**
 * POST /api/source-items/[id]/promote — Atomic promote-to-draft
 *
 * Combines entity creation + relationship + source status update in one transaction.
 * Replaces the 3-step client-side workflow that risked orphaned data.
 *
 * Body: { entityType, title, conceptKind? }
 * Returns: created entity summary
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import {
  isValidEnum,
  isNonEmptyString,
  slugify,
  VALID_CONTENT_ENTITY_TYPES,
  VALID_CONCEPT_KINDS,
} from "@/lib/validation";
import { DEFAULT_PROJECT_ID } from "@/lib/project";
import { ContentEntityType, EntityType, RelationType, ConceptKind } from "@prisma/client";

// UUID validation regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toEntityType(contentType: ContentEntityType): EntityType {
  // ContentEntityType is a strict subset of EntityType, but Prisma generates them as distinct enums.
  // Map explicitly to avoid unsafe casting.
  switch (contentType) {
    case "guide":
      return EntityType.guide;
    case "concept":
      return EntityType.concept;
    case "project":
      return EntityType.project;
    case "news":
      return EntityType.news;
  }
}

function sourceRelationTypeFor(contentType: ContentEntityType): RelationType {
  switch (contentType) {
    case "guide":
      return RelationType.GUIDE_REFERENCES_SOURCE;
    case "concept":
      return RelationType.CONCEPT_REFERENCES_SOURCE;
    case "project":
      return RelationType.PROJECT_REFERENCES_SOURCE;
    case "news":
      return RelationType.NEWS_REFERENCES_SOURCE;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id || !UUID_RE.test(id)) {
      return badRequest("id must be a valid UUID");
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const b = body as Record<string, unknown>;

    // Validate required fields
    if (!isValidEnum(b.entityType, VALID_CONTENT_ENTITY_TYPES)) {
      return badRequest(
        "entityType is required and must be one of: " +
          VALID_CONTENT_ENTITY_TYPES.join(", ")
      );
    }

    if (!isNonEmptyString(b.title)) {
      return badRequest("title is required");
    }

    if (b.conceptKind !== undefined && b.conceptKind !== null) {
      if (b.entityType !== "concept") {
        return badRequest("conceptKind is only valid for concepts");
      }
      if (!isValidEnum(b.conceptKind, VALID_CONCEPT_KINDS)) {
        return badRequest(
          "conceptKind must be one of: " + VALID_CONCEPT_KINDS.join(", ")
        );
      }
    }

    const contentEntityType = b.entityType as ContentEntityType;
    const entityTypeForLogs = toEntityType(contentEntityType);

    const title = b.title as string;
    const conceptKindInput = b.conceptKind as string | undefined;

    // Safely resolve ConceptKind enum value
    let resolvedConceptKind: ConceptKind | null = null;

    if (contentEntityType === "concept") {
      const value = conceptKindInput ?? "standard";

      // Validate against Prisma enum values (no string casting)
      if (!Object.values(ConceptKind).includes(value as ConceptKind)) {
        return badRequest(
          "conceptKind must be one of: " + Object.values(ConceptKind).join(", ")
        );
      }

      resolvedConceptKind = ConceptKind[value as keyof typeof ConceptKind];
    }

    // Load source item
    const sourceItem = await prisma.sourceItem.findUnique({
      where: { id },
      select: { id: true, status: true, url: true },
    });

    if (!sourceItem) {
      return notFound("Source item not found");
    }

    // Only promotable from ingested or triaged
    if (sourceItem.status !== "ingested" && sourceItem.status !== "triaged") {
      return badRequest(
        `Cannot promote source in status "${sourceItem.status}". Must be ingested or triaged.`
      );
    }

    // Generate slug and check uniqueness within project
    const slug = slugify(title);

    const existingSlug = await prisma.entity.findUnique({
      where: {
        projectId_entityType_slug: {
          projectId: DEFAULT_PROJECT_ID,
          entityType: contentEntityType,
          slug,
        },
      },
      select: { id: true },
    });

    if (existingSlug) {
      return badRequest(`Slug "${slug}" already exists for ${contentEntityType}`);
    }

    const relationType = sourceRelationTypeFor(contentEntityType);

    // --- Single atomic transaction ---
    const entity = await prisma.$transaction(async (tx) => {
      const newEntity = await tx.entity.create({
        data: {
          entityType: contentEntityType,
          title,
          slug,
          conceptKind: resolvedConceptKind,
          status: "draft",
          projectId: DEFAULT_PROJECT_ID,
        },
      });

      // 2. Create source→entity relationship
      await tx.entityRelation.create({
        data: {
          fromEntityType: entityTypeForLogs,
          fromEntityId: newEntity.id,
          relationType,
          toEntityType: EntityType.sourceItem,
          toEntityId: sourceItem.id,
          projectId: DEFAULT_PROJECT_ID,
        },
      });

      // 3. Update source item status to "used"
      await tx.sourceItem.update({
        where: { id: sourceItem.id },
        data: { status: "used" },
      });

      // 4. Log all events
      await tx.eventLog.create({
        data: {
          eventType: "ENTITY_CREATED",
          entityType: entityTypeForLogs,
          entityId: newEntity.id,
          actor: "human",
          projectId: DEFAULT_PROJECT_ID,
          details: {
            title: newEntity.title,
            slug: newEntity.slug,
            promotedFromSource: sourceItem.id,
          },
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "RELATION_CREATED",
          entityType: entityTypeForLogs,
          entityId: newEntity.id,
          actor: "human",
          projectId: DEFAULT_PROJECT_ID,
          details: {
            relationType,
            fromEntityId: newEntity.id,
            toEntityId: sourceItem.id,
          },
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: "SOURCE_TRIAGED",
          entityType: EntityType.sourceItem,
          entityId: sourceItem.id,
          actor: "human",
          projectId: DEFAULT_PROJECT_ID,
          details: {
            previousStatus: sourceItem.status,
            newStatus: "used",
            promotedToEntity: newEntity.id,
          },
        },
      });

      return newEntity;
    });

    return createdResponse({
      id: entity.id,
      entityType: entity.entityType,
      title: entity.title,
      slug: entity.slug,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/source-items/[id]/promote error:", error);
    return serverError();
  }
}
