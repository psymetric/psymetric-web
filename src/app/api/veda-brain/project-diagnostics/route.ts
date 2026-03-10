/**
 * GET /api/veda-brain/project-diagnostics
 *
 * Returns compute-on-read VEDA Brain Phase 1 diagnostics for a project.
 * Read-only. No mutations. No EventLog writes.
 *
 * Compares SERP Observatory signals with Content Graph structure to produce
 * structured mismatch diagnostics.
 *
 * Per docs/specs/CONTENT-GRAPH-PHASES.md, docs/specs/future-ideas/VEDA-BRAIN-MAGICAL-OPTIONS.md
 */
import { NextRequest } from "next/server";
import { badRequest, serverError, successResponse } from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { computeVedaBrainDiagnostics } from "@/lib/veda-brain/veda-brain-diagnostics";

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const diagnostics = await computeVedaBrainDiagnostics(projectId);

    return successResponse({ projectId, diagnostics });
  } catch (err) {
    console.error("GET /api/veda-brain/project-diagnostics error:", err);
    return serverError();
  }
}
