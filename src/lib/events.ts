/**
 * Event logging utility
 * Per docs/07-RELATIONSHIP-AND-EVENT-VOCABULARY.md and DB-ARCHITECTURE-PLAN.md:
 * - Events are append-only
 * - Events must always reference entityType, entityId, actor
 * - Event types use canonical vocabulary
 */
import { prisma } from "./prisma";
import type { EventType, EntityType, ActorType, Prisma } from "@prisma/client";

export async function logEvent(params: {
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  actor: ActorType;
  projectId: string;
  details?: Record<string, unknown>;
}) {
  return prisma.eventLog.create({
    data: {
      eventType: params.eventType,
      entityType: params.entityType,
      entityId: params.entityId,
      actor: params.actor,
      projectId: params.projectId,
      details: (params.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}
