# PsyMetric MCP Server

Phase 1 read-only MCP server for Claude Desktop integration.

## Setup Instructions

### 1. Install Dependencies

```bash
cd C:\dev\psymetric\mcp\claude-desktop
npm install
```

### 2. Build the Server

```bash
npm run build
```

### 3. Environment Variables

Set your database connection:

```bash
# Windows
set DATABASE_URL="postgresql://username:password@host:port/database"

# Or create .env file
echo DATABASE_URL="your_connection_string" > .env
```

### 4. Run the Server

```bash
npm start
```

For development:
```bash
npm run dev
```

## Claude Desktop Configuration

Add this to your Claude Desktop config file:

**Location**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "psymetric": {
      "command": "node",
      "args": ["C:\\dev\\psymetric\\mcp\\claude-desktop\\dist\\index.js"],
      "env": {
        "DATABASE_URL": "postgresql://username:password@host:port/database"
      }
    }
  }
}
```

## Available Tools

1. **list_projects** - Get all accessible projects
2. **search_entities** - Search entities within a project  
3. **get_entity** - Get detailed entity information
4. **get_entity_graph** - Get entity with relationship graph

## Example Tool Calls

### list_projects
```json
{
  "name": "list_projects",
  "arguments": {}
}
```

**Response**:
```json
{
  "projects": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "AI Research Project",
      "slug": "ai-research", 
      "description": "Research into AI capabilities",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:22:00.000Z"
    }
  ]
}
```

### get_entity
```json
{
  "name": "get_entity",
  "arguments": {
    "projectId": "123e4567-e89b-12d3-a456-426614174000",
    "entityId": "987fcdeb-51a2-43d7-8765-123456789abc"
  }
}
```

**Response**:
```json
{
  "entity": {
    "id": "987fcdeb-51a2-43d7-8765-123456789abc",
    "entityType": "concept",
    "title": "Machine Learning Fundamentals",
    "slug": "ml-fundamentals",
    "summary": "Core concepts in machine learning",
    "difficulty": "beginner",
    "conceptKind": "standard",
    "comparisonTargets": [],
    "repoUrl": null,
    "repoDefaultBranch": null,
    "license": null,
    "status": "published",
    "canonicalUrl": "https://example.com/ml-fundamentals",
    "contentRef": null,
    "publishedAt": "2024-01-18T09:15:00.000Z",
    "archivedAt": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-18T09:15:00.000Z",
    "relationshipCounts": {
      "outgoing": 3,
      "incoming": 7
    }
  }
}
```

## Logging

Operational logs are written to `./logs/mcp-server.jsonl` in structured JSON format:

```json
{"timestamp":"2024-01-20T10:30:00.000Z","level":"info","operation":"tool_call:get_entity","projectId":"123e4567-e89b-12d3-a456-426614174000","entityId":"987fcdeb-51a2-43d7-8765-123456789abc","duration":45}
```

## Phase 1 Constraints

- **Read-only**: No database writes, updates, or deletes
- **Project isolation**: All operations scoped by projectId  
- **Deterministic**: Consistent ordering and results
- **Resource limits**: Timeouts, node/edge caps, result limits
- **Entity-only graphs**: Excludes non-Entity relationship targets

## Troubleshooting

1. **Connection issues**: Check DATABASE_URL and database accessibility
2. **Permission errors**: Verify file system permissions for logs directory
3. **Tool timeouts**: Check database performance and query complexity
4. **Validation errors**: Review input parameters against schemas

See `IMPLEMENTATION_STATUS.md` for detailed feature coverage.
