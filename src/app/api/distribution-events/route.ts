/**
 * POST /api/distribution-events — Record distribution action
 *
 * Phase 1 Distribution & Metrics - Minimal write endpoint
 * - Records manual distribution (human-posted content to X)
 * - No autonomous posting, no draft workflow
 * - Always creates as published status
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
import { isValidEnum, isValidUrl, VALID_PLATFORMS } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON body");
    }

    const { platform, primaryEntityId, externalUrl, publishedAt } = body;

    // Validate platform
    if (!isValidEnum(platform, VALID_PLATFORMS)) {
      return badRequest("platform must be one of: website, x, youtube, github, other");
    }

    // Validate primaryEntityId
    if (!primaryEntityId || typeof primaryEntityId !== "string") {
      return badRequest("primaryEntityId is required");
    }

    // Validate externalUrl
    if (!isValidUrl(externalUrl)) {
      return badRequest("externalUrl must be a valid URL");
    }

    // Parse publishedAt if provided
    let publishedAtDate = new Date();
    if (publishedAt) {
      if (typeof publishedAt !== "string") {
        return badRequest("publishedAt must be an ISO date string");
      }
      publishedAtDate = new Date(publishedAt);
      if (isNaN(publishedAtDate.getTime())) {
        return badRequest("publishedAt must be a valid ISO date string");
      }
    }

    // Verify primary entity exists
    const entity = await prisma.entity.findUnique({
      where: { id: primaryEntityId },
      select: { id: true, entityType: true },
    });

    if (!entity) {
      return notFound("Primary entity not found");
    }

    // Create distribution event
    const distributionEvent = await prisma.distributionEvent.create({
      data: {
        platform,
        externalUrl,
        status: "published",
        publishedAt: publishedAtDate,
        primaryEntityType: entity.entityType,
        primaryEntityId,
      },
    });

    // Log event
    await logEvent({
      eventType: "DISTRIBUTION_PUBLISHED",
      entityType: "distributionEvent",
      entityId: distributionEvent.id,
      actor: "human",
      details: {
        platform,
        primaryEntityId,
        externalUrl,
      },
    });

    return createdResponse({
      id: distributionEvent.id,
      platform: distributionEvent.platform,
      externalUrl: distributionEvent.externalUrl,
      status: distributionEvent.status,
      publishedAt: distributionEvent.publishedAt?.toISOString(),
      archivedAt: distributionEvent.archivedAt?.toISOString(),
      primaryEntityType: distributionEvent.primaryEntityType,
      primaryEntityId: distributionEvent.primaryEntityId,
      createdAt: distributionEvent.createdAt.toISOString(),
      updatedAt: distributionEvent.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/distribution-events error:", error);
    return serverError();
  }
}
