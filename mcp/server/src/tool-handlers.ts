/**
 * Tool Call Handlers
 *
 * Maps tool invocations to API endpoints and formats responses
 * with context-efficient results (structured + compact JSON text).
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ApiClient } from "./api-client.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Validate UUID format
 */
function validateUuid(value: string, paramName: string): void {
  if (!UUID_RE.test(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must be a valid UUID`
    );
  }
}

/**
 * Validate ISO date format
 */
function validateIsoDate(value: string, paramName: string): void {
  if (!ISO_DATE_RE.test(value)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `${paramName} must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)`
    );
  }
}

/**
 * Clamp pagination parameters to valid ranges
 */
function clampPagination(params: Record<string, unknown>): { page: number; limit: number } {
  const page = Math.max(1, Math.floor(Number(params.page ?? 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(params.limit ?? 20))));
  return { page, limit };
}

/**
 * Build query string from parameters
 */
function buildQueryString(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Handle API errors and map to MCP errors
 */
async function handleApiError(response: Response): Promise<never> {
  let errorBody: ApiErrorBody | null = null;
  try {
    errorBody = await response.json() as ApiErrorBody;
  } catch {
    // Non-JSON error response
  }

  const backendMessage = errorBody?.error?.message ?? response.statusText;

  // Map HTTP status codes to MCP error codes
  switch (response.status) {
    case 400:
      throw new McpError(ErrorCode.InvalidParams, backendMessage);
    case 401:
      throw new McpError(ErrorCode.InvalidRequest, backendMessage);
    case 403:
      throw new McpError(ErrorCode.InvalidRequest, backendMessage);
    case 404:
      // Preserve 404 non-disclosure: backend message is intentionally vague
      throw new McpError(ErrorCode.InternalError, backendMessage);
    case 409:
      throw new McpError(ErrorCode.InvalidRequest, backendMessage);
    default:
      // 5xx and other errors
      throw new McpError(ErrorCode.InternalError, backendMessage);
  }
}

/**
 * Format tool result with structured content + compact JSON text
 * (context-efficient per Anthropic guidance)
 */
function formatToolResult(data: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data),
      },
    ],
    isError: false,
  };
}

/**
 * Main tool call dispatcher
 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  switch (toolName) {
    case "list_projects":
      return handleListProjects(args, apiClient);
    case "search_entities":
      return handleSearchEntities(args, apiClient);
    case "get_entity":
      return handleGetEntity(args, apiClient);
    case "get_entity_graph":
      return handleGetEntityGraph(args, apiClient);
    case "list_search_performance":
      return handleListSearchPerformance(args, apiClient);
    case "list_quotable_blocks":
      return handleListQuotableBlocks(args, apiClient);
    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
  }
}

/**
 * list_projects: GET /api/projects
 */
async function handleListProjects(
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  const { page, limit } = clampPagination(args);

  const queryString = buildQueryString({ page, limit });
  const response = await apiClient.fetch(`/api/projects${queryString}`);

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  return formatToolResult(data);
}

/**
 * search_entities: GET /api/entities
 */
async function handleSearchEntities(
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  const { page, limit } = clampPagination(args);

  const queryParams: Record<string, unknown> = { page, limit };

  if (args.entityType) queryParams.entityType = args.entityType;
  if (args.status) queryParams.status = args.status;
  if (args.conceptKind) queryParams.conceptKind = args.conceptKind;
  if (args.search) queryParams.search = args.search;

  const queryString = buildQueryString(queryParams);
  const response = await apiClient.fetch(`/api/entities${queryString}`);

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  return formatToolResult(data);
}

/**
 * get_entity: GET /api/entities/:id
 */
async function handleGetEntity(
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  const entityId = args.entityId as string;
  if (!entityId) {
    throw new McpError(ErrorCode.InvalidParams, "entityId is required");
  }

  validateUuid(entityId, "entityId");

  const response = await apiClient.fetch(`/api/entities/${entityId}`);

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  return formatToolResult(data);
}

/**
 * get_entity_graph: GET /api/entities/:id/graph
 */
async function handleGetEntityGraph(
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  const entityId = args.entityId as string;
  if (!entityId) {
    throw new McpError(ErrorCode.InvalidParams, "entityId is required");
  }

  validateUuid(entityId, "entityId");

  const queryParams: Record<string, unknown> = {};
  if (args.depth !== undefined) {
    const depth = Number(args.depth);
    if (depth !== 1 && depth !== 2) {
      throw new McpError(ErrorCode.InvalidParams, "depth must be 1 or 2");
    }
    queryParams.depth = depth;
  }
  if (args.relationshipTypes) {
    queryParams.relationshipTypes = args.relationshipTypes;
  }

  const queryString = buildQueryString(queryParams);
  const response = await apiClient.fetch(`/api/entities/${entityId}/graph${queryString}`);

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  return formatToolResult(data);
}

/**
 * list_search_performance: GET /api/seo/search-performance
 */
async function handleListSearchPerformance(
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  const { page, limit } = clampPagination(args);

  // Validate optional UUID and date parameters
  if (args.entityId) {
    validateUuid(args.entityId as string, "entityId");
  }
  if (args.dateStart) {
    validateIsoDate(args.dateStart as string, "dateStart");
  }
  if (args.dateEnd) {
    validateIsoDate(args.dateEnd as string, "dateEnd");
  }

  const queryParams: Record<string, unknown> = { page, limit };
  if (args.query) queryParams.query = args.query;
  if (args.pageUrl) queryParams.pageUrl = args.pageUrl;
  if (args.entityId) queryParams.entityId = args.entityId;
  if (args.dateStart) queryParams.dateStart = args.dateStart;
  if (args.dateEnd) queryParams.dateEnd = args.dateEnd;

  const queryString = buildQueryString(queryParams);
  const response = await apiClient.fetch(`/api/seo/search-performance${queryString}`);

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  return formatToolResult(data);
}

/**
 * list_quotable_blocks: GET /api/quotable-blocks
 */
async function handleListQuotableBlocks(
  args: Record<string, unknown>,
  apiClient: ApiClient
): Promise<unknown> {
  const { page, limit } = clampPagination(args);

  // Validate optional parameters
  if (args.entityId) {
    validateUuid(args.entityId as string, "entityId");
  }
  if (args.verifiedUntilBefore) {
    validateIsoDate(args.verifiedUntilBefore as string, "verifiedUntilBefore");
  }
  if (args.verifiedUntilAfter) {
    validateIsoDate(args.verifiedUntilAfter as string, "verifiedUntilAfter");
  }

  const queryParams: Record<string, unknown> = { page, limit };
  if (args.entityId) queryParams.entityId = args.entityId;
  if (args.claimType) queryParams.claimType = args.claimType;
  if (args.topicTag) queryParams.topicTag = args.topicTag;
  if (args.verifiedUntilBefore) queryParams.verifiedUntilBefore = args.verifiedUntilBefore;
  if (args.verifiedUntilAfter) queryParams.verifiedUntilAfter = args.verifiedUntilAfter;

  const queryString = buildQueryString(queryParams);
  const response = await apiClient.fetch(`/api/quotable-blocks${queryString}`);

  if (!response.ok) {
    await handleApiError(response);
  }

  const data = await response.json();
  return formatToolResult(data);
}
