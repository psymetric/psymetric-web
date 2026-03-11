/**
 * GET /api/veda-brain/proposals
 *
 * Returns Phase C1 SERP-to-Content-Graph proposals for a project.
 * Read-only. No mutations. No EventLog writes. Compute-on-read.
 *
 * Phase C1 returns:
 *   - archetypeProposals (from archetypeAlignment diagnostics)
 *   - schemaProposals    (from schemaOpportunity diagnostics)
 *
 * Deferred (DQ-001, DQ-002, DQ-003):
 *   - topicProposals, entityProposals, authoritySupportProposals
 *
 * Per docs/specs/SERP-TO-CONTENT-GRAPH-PROPOSALS.md
 */
import { NextRequest } from "next/server";
import { badRequest, serverError, successResponse } from "@/lib/api-response";
import { resolveProjectId } from "@/lib/project";
import { computeVedaBrainDiagnostics } from "@/lib/veda-brain/veda-brain-diagnostics";
import { computeProposals } from "@/lib/veda-brain/proposals";

export async function GET(request: NextRequest) {
  try {
    const { projectId, error } = await resolveProjectId(request);
    if (error) return badRequest(error);

    const diagnostics = await computeVedaBrainDiagnostics(projectId);
    const { proposals, summary } = computeProposals(diagnostics);

    return successResponse({ projectId, proposals, summary });
  } catch (err) {
    console.error("GET /api/veda-brain/proposals error:", err);
    return serverError();
  }
}
