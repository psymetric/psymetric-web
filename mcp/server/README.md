# VEDA MCP Server

**API-backed read-only MCP bridge for VEDA backend.**

This MCP server provides 6 read-only tools for querying VEDA data via HTTP API. It uses stdio transport for compatibility with Claude Desktop and other MCP clients.

## Architecture

```
MCP Client (Claude Desktop / VS Code)
    ↓ stdio
MCP Server (this package)
    ↓ HTTP
VEDA Backend API (Next.js)
    ↓
PostgreSQL Database
```

**Key Design Principles:**
- **API-backed only** — No direct database access, no Prisma
- **Read-only operations** — No write capabilities (Phase 1)
- **Project-scoped** — All queries respect project isolation via headers
- **Context-efficient** — Structured results + compact JSON text for token efficiency

## Installation

```bash
cd mcp/server
npm install
npm run build
```

## Configuration

### Required Environment Variables

The server reads `VEDA_*` variables first and falls back to `PSYMETRIC_*` for backward compatibility.

**Backend URL:**
```bash
VEDA_BASE_URL=http://localhost:3000
# PSYMETRIC_BASE_URL=http://localhost:3000  # legacy fallback
```

**Project Scope (exactly one required):**
```bash
# Option 1: Project UUID
VEDA_PROJECT_ID=00000000-0000-4000-a000-000000000001
# PSYMETRIC_PROJECT_ID=...  # legacy fallback

# Option 2: Project slug
VEDA_PROJECT_SLUG=your-project-slug
# PSYMETRIC_PROJECT_SLUG=...  # legacy fallback
```

### Optional Environment Variables

```bash
# HTTP request timeout (default: 30000ms)
VEDA_TIMEOUT_MS=30000
# PSYMETRIC_TIMEOUT_MS=30000  # legacy fallback
```

### Fail-Fast Validation

The server will exit immediately at startup if:
- Neither `VEDA_BASE_URL` nor `PSYMETRIC_BASE_URL` is set
- No project scope is set (neither `VEDA_PROJECT_ID`, `PSYMETRIC_PROJECT_ID`, `VEDA_PROJECT_SLUG`, nor `PSYMETRIC_PROJECT_SLUG`)
- Both project ID and slug resolve to a value (ambiguous)
- Project ID is not a valid UUID
- Timeout is not a positive number

**No silent fallbacks** — project scoping is explicit and required.

## Claude Desktop Configuration

Add to your Claude Desktop config file:

**macOS/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "veda": {
      "command": "node",
      "args": ["/absolute/path/to/psymetric/mcp/server/dist/index.js"],
      "env": {
        "VEDA_BASE_URL": "http://localhost:3000",
        "VEDA_PROJECT_ID": "00000000-0000-4000-a000-000000000001"
      }
    }
  }
}
```

**Important:** Use absolute paths. Restart Claude Desktop after configuration changes.

## Available Tools

| Tool | Purpose | Backend Endpoint |
|------|---------|------------------|
| `list_projects` | List all projects | `GET /api/projects` |
| `search_entities` | Search/filter entities | `GET /api/entities` |
| `get_entity` | Get single entity details | `GET /api/entities/:id` |
| `get_entity_graph` | Get entity with relationship graph | `GET /api/entities/:id/graph` |
| `list_search_performance` | List GSC performance data | `GET /api/seo/search-performance` |
| `list_quotable_blocks` | List GEO citation blocks | `GET /api/quotable-blocks` |

### Tool Details

#### list_projects
Lists all accessible projects in alphabetical order.

**Parameters:**
- `page` (number, optional): Page number (default 1)
- `limit` (number, optional): Results per page (default 20, max 100)

#### search_entities
Search and filter entities within the configured project.

**Parameters:**
- `entityType` (string, optional): Filter by type (guide, concept, project, news)
- `status` (string, optional): Filter by status (draft, publish_requested, published, archived)
- `conceptKind` (string, optional): Filter concepts (standard, model, comparison)
- `search` (string, optional): Search in title and slug
- `page`, `limit`: Pagination parameters

#### get_entity
Retrieve a single entity by UUID.

**Parameters:**
- `entityId` (string, required): Entity UUID

#### get_entity_graph
Retrieve entity with relationship graph (depth 1-2).

**Parameters:**
- `entityId` (string, required): Entity UUID
- `depth` (number, optional): Graph depth (1 or 2, default 1)
- `relationshipTypes` (string, optional): Comma-separated relationship type filter

#### list_search_performance
List Google Search Console performance records.

**Parameters:**
- `query` (string, optional): Filter by search query
- `pageUrl` (string, optional): Filter by page URL
- `entityId` (string, optional): Filter by linked entity UUID
- `dateStart`, `dateEnd` (string, optional): ISO 8601 date range filters
- `page`, `limit`: Pagination parameters

#### list_quotable_blocks
List quotable citation blocks for GEO optimization.

**Parameters:**
- `entityId` (string, optional): Filter by parent entity UUID
- `claimType` (string, optional): Filter by claim type (statistic, comparison, definition, howto_step)
- `topicTag` (string, optional): Filter by topic tag
- `verifiedUntilBefore`, `verifiedUntilAfter` (string, optional): Verification date filters
- `page`, `limit`: Pagination parameters

## Project Scoping

All tools (except `list_projects`) automatically inject project scope headers based on environment configuration:

- `x-project-id: <uuid>` when a project ID is resolved (`VEDA_PROJECT_ID` or `PSYMETRIC_PROJECT_ID`)
- `x-project-slug: <slug>` when a project slug is resolved (`VEDA_PROJECT_SLUG` or `PSYMETRIC_PROJECT_SLUG`)

**Security Note:** Project scoping is server-controlled, not tool-parameter-controlled. This prevents users/LLMs from accessing arbitrary projects.

## Response Format

All tools return results in **context-efficient format** per Anthropic guidance:

```json
{
  "content": [
    {
      "type": "text",
      "text": "<compact JSON string of backend response>"
    }
  ],
  "isError": false
}
```

**Why this format:**
- Compact JSON strings reduce token usage
- Structured content + text serialization for compatibility
- Preserves backend determinism (no reordering or reshaping)

## Error Handling

Backend errors are mapped to MCP error codes:

| Backend Error | MCP Error Code | Example |
|---------------|----------------|---------|
| 400 BAD_REQUEST | InvalidParams | Invalid UUID format |
| 401 UNAUTHORIZED | InvalidRequest | Missing credentials |
| 403 FORBIDDEN | InvalidRequest | Insufficient permissions |
| 404 NOT_FOUND | InternalError | Entity not found (no existence disclosure) |
| 409 CONFLICT | InvalidRequest | Resource conflict |
| 5xx SERVER_ERROR | InternalError | Internal server error |
| Timeout | InternalError | Tool execution timeout |

**404 Non-Disclosure:** Cross-project entity access returns 404 without confirming entity existence (security feature).

## Development

```bash
# Development mode (TypeScript with tsx)
npm run dev

# Build
npm run build

# Run production
npm start
```

## Phase 1 Constraints

This server implements **Phase 1 read-only bridge** with the following explicit constraints:

- ✅ Read-only operations only
- ✅ API-backed (no Prisma, no direct DB access)
- ✅ Project-scoped via headers
- ✅ Deterministic results (backend ordering preserved)
- ❌ No write operations
- ❌ No background jobs or caching
- ❌ No LLM broker integration

Future phases may introduce additional capabilities.

## Troubleshooting

**Server exits at startup:**
- Check that all required environment variables are set
- Verify `VEDA_PROJECT_ID` (or `PSYMETRIC_PROJECT_ID`) is a valid UUID format
- Ensure only one project scope variable resolves to a value

**Connection refused:**
- Verify `VEDA_BASE_URL` (or `PSYMETRIC_BASE_URL`) points to running backend
- Check backend is accessible from MCP server environment

**404 errors for existing entities:**
- Verify project scope matches entity's project
- Remember: 404 is returned for cross-project access (security feature)

**Timeout errors:**
- Increase `VEDA_TIMEOUT_MS` (or `PSYMETRIC_TIMEOUT_MS`) if needed
- Check backend performance and network latency

## License

Internal use only. Part of VEDA project.
