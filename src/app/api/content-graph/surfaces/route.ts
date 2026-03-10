/**
 * GET /api/content-graph/surfaces — List surfaces for project
 * POST /api/content-graph/surfaces — Register a surface
 *
 * Per docs/specs/CONTENT-GRAPH-DATA-MODEL.md (Phase 1)
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listResponse,
  createdResponse,
  badRequest,
  serverError,
  parsePagination,
} from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { CreateCgSurfaceSchema } from "@/lib/schemas/content-graph";
import { formatZodErrors } from "@/lib/zod-helpers";

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const { page, limit, skip } = parsePagination(request.nextUrl.searchParams);
    const where = { projectId };

    const [surfaces, total] = await Promise.all([
      prisma.cgSurface.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
      prisma.cgSurface.count({ where }),
    ]);

    return listResponse(surfaces, { page, limit, total });
  } catch (err) {
    console.error("GET /api/content-graph/surfaces error:", err);
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    let body: unknown;
    try { body = await request.json(); } catch { return badRequest("Invalid JSON body"); }

    const parsed = CreateCgSurfaceSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", formatZodErrors(parsed.error));

    const { type, key, label, enabled } = parsed.data;

    const existing = await prisma.cgSurface.findUnique({
      where: { projectId_key: { projectId, key } },
    });
    if (existing) return badRequest(`Surface key "${key}" already exists for this project`);

    const surface = await prisma.$transaction(async (tx) => {
      const created = await tx.cgSurface.create({
        data: { projectId, type, key, label: label ?? null, enabled: enabled ?? true },
      });
      await tx.eventLog.create({
        data: {
          eventType: "CG_SURFACE_CREATED",
          entityType: "cgSurface",
          entityId: created.id,
          actor: "human",
          projectId,
          details: { key, type },
        },
      });
      return created;
    });

    return createdResponse(surface);
  } catch (err) {
    console.error("POST /api/content-graph/surfaces error:", err);
    return serverError();
  }
}
