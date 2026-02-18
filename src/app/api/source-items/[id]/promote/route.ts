/**
 * DEPRECATED / DISABLED ENDPOINT
 *
 * This file previously contained a mistaken copy of GET /api/source-items.
 * The canonical API contract (docs/operations-planning-api/01-API-ENDPOINTS-AND-VALIDATION-CONTRACTS.md)
 * does not define a source-item "promote" endpoint.
 *
 * We intentionally return 404 for all methods until a real spec exists.
 */

import { serverError } from "@/lib/api-response";
import { NextRequest } from "next/server";

function disabled() {
  // Intentionally do not resolve projectId or reveal existence.
  return new Response(null, { status: 404 });
}

export async function GET(_request: NextRequest) {
  try {
    return disabled();
  } catch {
    return serverError();
  }
}

export async function POST(_request: NextRequest) {
  try {
    return disabled();
  } catch {
    return serverError();
  }
}
