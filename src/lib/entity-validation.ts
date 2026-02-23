/**
 * Entity Validation Logic for Publish Lifecycle
 * Phase 1 minimal, deterministic validation only
 */
import { prisma } from "./prisma";
import { isValidUrl } from "./validation";

export interface ValidationError {
  code: string;
  category: string;
  level: string;
  message: string;
}

export interface ValidationResult {
  status: "pass" | "fail";
  categories: {
    anatomy: "pass" | "fail";
    relationships: "pass" | "fail";
    citations: "pass" | "fail";
    metadata: "pass" | "fail";
    content: "pass" | "fail";
  };
  errors: ValidationError[];
}

interface Entity {
  id: string;
  entityType: string;
  title: string;
  slug: string;
  repoUrl: string | null;
  contentRef: string | null;
}

export async function validateEntityForPublish(args: {
  entity: Entity;
  projectId: string;
}): Promise<ValidationResult> {
  const { entity, projectId } = args;
  const errors: ValidationError[] = [];
  
  const categories = {
    anatomy: "pass" as "pass" | "fail",
    relationships: "pass" as "pass" | "fail", 
    citations: "pass" as "pass" | "fail",
    metadata: "pass" as "pass" | "fail",
    content: "pass" as "pass" | "fail",
  };

  // --- Anatomy validation ---
  if (!entity.title || entity.title.trim().length === 0) {
    errors.push({
      code: "TITLE_MISSING",
      category: "anatomy",
      level: "BLOCKING",
      message: "Title is required",
    });
    categories.anatomy = "fail";
  }

  if (!entity.slug || entity.slug.trim().length === 0) {
    errors.push({
      code: "SLUG_MISSING", 
      category: "anatomy",
      level: "BLOCKING",
      message: "Slug is required",
    });
    categories.anatomy = "fail";
  }

  // Project-specific validation: repoUrl must be valid URL
  if (entity.entityType === "project") {
    if (!entity.repoUrl || !isValidUrl(entity.repoUrl)) {
      errors.push({
        code: "REPO_URL_MISSING",
        category: "anatomy",
        level: "BLOCKING", 
        message: "Project must have a valid repository URL",
      });
      categories.anatomy = "fail";
    }
  }

  // --- Content validation ---
  if ((entity.entityType === "guide" || entity.entityType === "news") && !entity.contentRef) {
    errors.push({
      code: "CONTENT_REF_MISSING",
      category: "content",
      level: "BLOCKING",
      message: `${entity.entityType} must have content reference`,
    });
    categories.content = "fail";
  }

  // --- Relationships validation ---
  if (entity.entityType === "guide") {
    const guideRelations = await prisma.entityRelation.findFirst({
      where: {
        projectId,
        OR: [
          {
            fromEntityType: "guide",
            fromEntityId: entity.id,
            toEntityType: "concept",
          },
          {
            fromEntityType: "concept", 
            toEntityType: "guide",
            toEntityId: entity.id,
          },
        ],
      },
    });

    if (!guideRelations) {
      errors.push({
        code: "RELATIONSHIP_MISSING",
        category: "relationships",
        level: "BLOCKING",
        message: "Guide must reference at least one Concept",
      });
      categories.relationships = "fail";
    }
  }

  // --- Citations (pass for now - Phase 1 stub) ---
  categories.citations = "pass";

  // --- Metadata validation ---
  // canonicalUrl is optional, no validation needed for Phase 1
  categories.metadata = "pass";

  const status = errors.length > 0 ? "fail" : "pass";
  
  return {
    status,
    categories,
    errors,
  };
}
