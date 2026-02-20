/**
 * MCP Tool Definitions (Phase 1 Read-Only Bridge)
 *
 * Defines the 6 read-only tools with JSON Schema for input validation.
 */

export const toolDefinitions = [
  {
    name: "list_projects",
    description:
      "List all projects accessible to the current user. Returns projects in alphabetical order by slug.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (1-indexed, default 1, min 1)",
          minimum: 1,
        },
        limit: {
          type: "number",
          description: "Results per page (default 20, min 1, max 100)",
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_entities",
    description:
      "Search and filter entities within a project. Returns entities in reverse chronological order (newest first).",
    inputSchema: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          enum: ["guide", "concept", "project", "news"],
          description: "Filter by entity type",
        },
        status: {
          type: "string",
          enum: ["draft", "publish_requested", "published", "archived"],
          description: "Filter by publication status",
        },
        conceptKind: {
          type: "string",
          enum: ["standard", "model", "comparison"],
          description: "Filter by concept kind (only valid for concepts)",
        },
        search: {
          type: "string",
          description: "Search in title and slug (case-insensitive substring match)",
        },
        page: {
          type: "number",
          description: "Page number (1-indexed, default 1)",
          minimum: 1,
        },
        limit: {
          type: "number",
          description: "Results per page (default 20, max 100)",
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_entity",
    description:
      "Retrieve a single entity by ID with full details.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Entity UUID",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        },
      },
      required: ["entityId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_entity_graph",
    description:
      "Retrieve an entity with its relationship graph up to a specified depth. Returns relationships in reverse chronological order.",
    inputSchema: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Entity UUID",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        },
        depth: {
          type: "number",
          enum: [1, 2],
          description: "Graph traversal depth (default 1, max 2)",
        },
        relationshipTypes: {
          type: "string",
          description:
            "Comma-separated list of relationship types to filter (e.g., 'GUIDE_USES_CONCEPT,CONCEPT_RELATES_TO_CONCEPT')",
        },
      },
      required: ["entityId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_search_performance",
    description:
      "List Google Search Console performance records for the project. Returns records ordered by date descending, then by query and page URL.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Filter by search query (case-insensitive substring match)",
        },
        pageUrl: {
          type: "string",
          description: "Filter by page URL (case-insensitive substring match)",
        },
        entityId: {
          type: "string",
          description: "Filter by linked entity UUID",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        },
        dateStart: {
          type: "string",
          description: "Filter by date range start (ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)",
        },
        dateEnd: {
          type: "string",
          description: "Filter by date range end (ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)",
        },
        page: {
          type: "number",
          description: "Page number (1-indexed, default 1)",
          minimum: 1,
        },
        limit: {
          type: "number",
          description: "Results per page (default 20, max 100)",
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_quotable_blocks",
    description:
      "List quotable citation blocks for GEO optimization within the project. Returns blocks in reverse chronological order (newest first).",
    inputSchema: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Filter by parent entity UUID",
          pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        },
        claimType: {
          type: "string",
          enum: ["statistic", "comparison", "definition", "howto_step"],
          description: "Filter by claim type",
        },
        topicTag: {
          type: "string",
          description: "Filter by topic tag (case-insensitive substring match)",
        },
        verifiedUntilBefore: {
          type: "string",
          description: "Filter blocks verified until before this date (ISO 8601)",
        },
        verifiedUntilAfter: {
          type: "string",
          description: "Filter blocks verified until after this date (ISO 8601)",
        },
        page: {
          type: "number",
          description: "Page number (1-indexed, default 1)",
          minimum: 1,
        },
        limit: {
          type: "number",
          description: "Results per page (default 20, max 100)",
          minimum: 1,
          maximum: 100,
        },
      },
      additionalProperties: false,
    },
  },
] as const;
