/**
 * GET /api/projects — List all projects
 *
 * Phase 1 read-only endpoint for MCP `list_projects` tool.
 * - No user-level filtering (all projects visible)
 * - Deterministic ordering
 * - Standard pagination
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { listResponse, serverError, parsePagination } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams);

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        orderBy: [{ slug: "asc" }, { id: "asc" }],
        skip,
        take: limit,
      }),
      prisma.project.count(),
    ]);

    return listResponse(projects, { page, limit, total });
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return serverError();
  }
}
