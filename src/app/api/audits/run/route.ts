/**
 * POST /api/audits/run
 *
 * Phase 2 (S0): Deterministic, rules-based audit generator (no LLM).
 *
 * Contract:
 * - Strict project scoping via resolveProjectId()
 * - Canonical entities are read-only in this endpoint
 * - Persists the audit as a DraftArtifact (byda_s_audit)
 * - Emits DRAFT_CREATED EventLog inside the same prisma.$transaction()
 * - No schema changes
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  createdResponse,
  notFound,
  serverError,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import {
  ActorType,
  ContentEntityType,
  DraftArtifactKind,
  DraftArtifactStatus,
  EntityStatus,
  EntityType,
  EventType,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { RunAuditSchema } from "@/lib/schemas/audit";

const BYDA_S0_SCHEMA_VERSION = "byda.s0.v1";
const ALLOWED_KIND = DraftArtifactKind.byda_s_audit;
const EXPIRATION_DAYS = 30;

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

function clampScore(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function computeS0Scores(params: {
  title: string;
  summary: string | null;
  status: EntityStatus;
  outgoingRelationCount: number;
}) {
  // Phase 2 S0: simple deterministic scoring (0-100), no randomness.
  let citability = 50;
  let extractability = 50;
  let factualDensity = 50;

  const title = params.title.trim();
  const summary = (params.summary ?? "").trim();
  const rels = params.outgoingRelationCount;

  // Extractability: is there a usable title?
  if (title.length === 0) extractability -= 20;
  if (title.length >= 10) extractability += 10;

  // Citability: summary presence and basic length heuristic.
  if (summary.length === 0) citability -= 15;
  if (summary.length >= 120) citability += 10;

  // Factual density: relationships as a proxy for grounded linking.
  if (rels === 0) {
    factualDensity -= 20;
    citability -= 10;
  }
  if (rels >= 2) factualDensity += 10;

  // Draft penalty: published artifacts should be better structured; drafts are expected to be incomplete.
  if (params.status === EntityStatus.draft) factualDensity -= 10;

  return {
    citability: clampScore(citability),
    extractability: clampScore(extractability),
    factualDensity: clampScore(factualDensity),
  };
}

async function generateContentHash(content: string): Promise<string> {
  // Matches DraftArtifact POST hashing approach (SHA-256 via Web Crypto).
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) {
      return badRequest(error);
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return badRequest("Request body must be an object");
    }

    const parsed = RunAuditSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return badRequest("Validation failed", [
        ...flat.formErrors.map((msg) => ({
          code: "VALIDATION_ERROR" as const,
          message: msg,
        })),
        ...Object.entries(flat.fieldErrors).flatMap(([field, messages]) =>
          (messages ?? []).map((msg) => ({
            code: "VALIDATION_ERROR" as const,
            field,
            message: msg,
          }))
        ),
      ]);
    }

    const entityId = parsed.data.entityId;

    // Canonical read: entity must exist and belong to project
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        projectId: true,
        entityType: true,
        title: true,
        summary: true,
        status: true,
      },
    });

    if (!entity || entity.projectId !== projectId) {
      // Non-disclosure for missing/cross-project
      return notFound("Entity not found");
    }

    const entityTypeForRelations = mapContentEntityTypeToEntityType(entity.entityType);

    const outgoingRelationCount = await prisma.entityRelation.count({
      where: {
        projectId,
        fromEntityType: entityTypeForRelations,
        fromEntityId: entity.id,
      },
    });

    const now = new Date();
    const scores = computeS0Scores({
      title: entity.title,
      summary: entity.summary,
      status: entity.status,
      outgoingRelationCount,
    });

    // Store promote-compatible content shape (no extra keys).
    const contentObj = {
      schemaVersion: BYDA_S0_SCHEMA_VERSION,
      entityId: entity.id,
      scores,
      notes: "byda_s s0 audit (deterministic, rules-based)",
      createdAt: now.toISOString(),
    };

    const contentString = JSON.stringify(contentObj);
    const contentHash = await generateContentHash(contentString);

    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + EXPIRATION_DAYS);

    const result = await prisma.$transaction(async (tx) => {
      const artifact = await tx.draftArtifact.create({
        data: {
          kind: ALLOWED_KIND,
          status: DraftArtifactStatus.draft,
          content: contentString,
          entityId: entity.id,
          createdBy: ActorType.system,
          schemaVersion: BYDA_S0_SCHEMA_VERSION,
          source: "byda_s",
          contentHash,
          expiresAt,
          projectId,
        },
        select: {
          id: true,
          entityId: true,
          kind: true,
          status: true,
          expiresAt: true,
        },
      });

      const details: Prisma.InputJsonObject = {
        source: "byda_s",
        audit: "s0",
        schemaVersion: BYDA_S0_SCHEMA_VERSION,
        targetEntityId: entity.id,
        kind: ALLOWED_KIND,
        scores,
      };

      await tx.eventLog.create({
        data: {
          eventType: EventType.DRAFT_CREATED,
          entityType: EntityType.draftArtifact,
          entityId: artifact.id,
          actor: ActorType.system,
          projectId,
          details,
        },
      });

      return artifact;
    });

    return createdResponse(result);
  } catch (err) {
    console.error("POST /api/audits/run error:", err);
    return serverError();
  }
}
