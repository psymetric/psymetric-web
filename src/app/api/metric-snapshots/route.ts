/**
 * POST /api/metric-snapshots — Record metric snapshot
 *
 * Phase 1 Distribution & Metrics - Minimal write endpoint
 * - Records time-series metric snapshots
 * - No analytics, no conclusions, just data storage
 * - Deterministic validation only
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createdResponse,
  badRequest,
  notFound,
  serverError,
} from "@/lib/api-response";
import { logEvent } from "@/lib/events";
import { isValidEnum, VALID_PLATFORMS, VALID_METRIC_TYPES } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const { metricType, value, platform, entityId, capturedAt, notes } = body;

    // Validate metricType
    if (!isValidEnum(metricType, VALID_METRIC_TYPES)) {
      return badRequest("metricType must be one of: x_impressions, x_likes, x_reposts, x_replies, x_bookmarks");
    }

    // Validate value
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return badRequest("value must be an integer >= 0");
    }

    // Validate platform
    if (!isValidEnum(platform, VALID_PLATFORMS)) {
      return badRequest("platform must be one of: website, x, youtube, github, other");
    }

    // Validate entityId
    if (!entityId || typeof entityId !== "string") {
      return badRequest("entityId is required");
    }

    // Parse capturedAt if provided
    let capturedAtDate = new Date();
    if (capturedAt) {
      if (typeof capturedAt !== "string") {
        return badRequest("capturedAt must be an ISO date string");
      }
      capturedAtDate = new Date(capturedAt);
      if (isNaN(capturedAtDate.getTime())) {
        return badRequest("capturedAt must be a valid ISO date string");
      }
    }

    // Validate notes if provided
    if (notes !== undefined && typeof notes !== "string") {
      return badRequest("notes must be a string");
    }

    // Verify entity exists
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, entityType: true },
    });

    if (!entity) {
      return notFound("Entity not found");
    }

    // Create metric snapshot
    const metricSnapshot = await prisma.metricSnapshot.create({
      data: {
        metricType,
        value,
        platform,
        capturedAt: capturedAtDate,
        entityType: entity.entityType,
        entityId,
        notes: notes || null,
      },
    });

    // Log event
    await logEvent({
      eventType: "METRIC_SNAPSHOT_RECORDED",
      entityType: "metricSnapshot",
      entityId: metricSnapshot.id,
      actor: "human",
      details: {
        metricType,
        value,
        platform,
        entityId,
      },
    });

    return createdResponse({
      id: metricSnapshot.id,
      metricType: metricSnapshot.metricType,
      value: metricSnapshot.value,
      platform: metricSnapshot.platform,
      capturedAt: metricSnapshot.capturedAt.toISOString(),
      entityType: metricSnapshot.entityType,
      entityId: metricSnapshot.entityId,
      notes: metricSnapshot.notes,
      createdAt: metricSnapshot.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/metric-snapshots error:", error);
    return serverError();
  }
}
