# MCP Server Setup Instructions

## 1. Install MCP Server Dependencies

```bash
cd C:\dev\psymetric\mcp\server
npm install
```

## 2. Build the MCP Server

```bash
npm run build
```

This creates the compiled JavaScript in `dist/index.js`.

## 3. Update Claude Desktop Configuration

**Location:** `%APPDATA%\Claude\claude_desktop_config.json`

**Full path (typical):** `C:\Users\{YourUsername}\AppData\Roaming\Claude\claude_desktop_config.json`

### Option A: Complete Replacement

If this is your only MCP server, replace the entire file with:

```json
{
  "mcpServers": {
    "psymetric": {
      "command": "node",
      "args": ["C:\\dev\\psymetric\\mcp\\server\\dist\\index.js"],
      "env": {
        "PSYMETRIC_BASE_URL": "http://localhost:3000",
        "PSYMETRIC_PROJECT_ID": "00000000-0000-4000-a000-000000000001",
        "PSYMETRIC_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

### Option B: Add to Existing Configuration

If you already have other MCP servers configured, add the `psymetric` entry to your existing `mcpServers` object:

```json
{
  "mcpServers": {
    "your-existing-server": {
      ...
    },
    "psymetric": {
      "command": "node",
      "args": ["C:\\dev\\psymetric\\mcp\\server\\dist\\index.js"],
      "env": {
        "PSYMETRIC_BASE_URL": "http://localhost:3000",
        "PSYMETRIC_PROJECT_ID": "00000000-0000-4000-a000-000000000001",
        "PSYMETRIC_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

**Important Notes:**
- Use double backslashes (`\\`) in Windows paths in JSON
- The configuration snippet is available in: `mcp/server/claude-desktop-config.json`
- **Environment variables MUST be provided via Claude Desktop config** - the MCP server does not load `.env` files

### Project ID Configuration

**Default Project ID:** `00000000-0000-4000-a000-000000000001`

This is the seed project "PsyMetric" created by database migrations.

**To use a different project:**
1. Query your database: `SELECT id, name, slug FROM projects;`
2. Replace `PSYMETRIC_PROJECT_ID` with your chosen project's UUID
3. Or use `PSYMETRIC_PROJECT_SLUG` instead (replace `PSYMETRIC_PROJECT_ID` with `PSYMETRIC_PROJECT_SLUG: "your-slug"`)

**Important:** Exactly one of `PSYMETRIC_PROJECT_ID` or `PSYMETRIC_PROJECT_SLUG` must be set. Setting both or neither will cause startup failure.

## 4. Delete Legacy MCP Server

**Action Required:** Delete the old DB-direct MCP server:

```bash
# From project root
rm -rf mcp/claude-desktop
```

Or manually delete the folder: `C:\dev\psymetric\mcp\claude-desktop`

## 5. Restart Claude Desktop

After updating the configuration:
1. Completely quit Claude Desktop (not just close the window)
2. Restart Claude Desktop
3. The PsyMetric MCP server will start automatically

## 6. Verify Installation

In Claude Desktop, try asking:

```
"Can you list all projects using the list_projects tool?"
```

Or:

```
"Search for entities with the search_entities tool"
```

You should see the MCP server respond with data from your local PsyMetric backend.

## 7. Troubleshooting

### Server doesn't appear in Claude Desktop

- Check that the config file path is correct
- Verify JSON syntax is valid (use a JSON validator)
- Check Claude Desktop logs for errors
- Ensure you fully quit and restarted Claude Desktop

### "PSYMETRIC_BASE_URL is required" error

- Verify the environment variables in the config are set correctly
- Check that `PSYMETRIC_BASE_URL` points to your running backend
- Remember: MCP server reads ONLY from Claude Desktop config `env` block, NOT from `.env` files

### Connection refused errors

- Ensure your PsyMetric backend is running on `http://localhost:3000`
- Start backend: `npm run dev` from project root

### Invalid UUID error

- Verify `PSYMETRIC_PROJECT_ID` is a valid UUID format
- Default project ID: `00000000-0000-4000-a000-000000000001`
- Ensure exactly one of `PSYMETRIC_PROJECT_ID` or `PSYMETRIC_PROJECT_SLUG` is set

### "Project not found" or 404 errors on tool calls

- Verify the project UUID/slug exists in your database
- Run: `SELECT id, slug, name FROM projects;` to see available projects
- Update Claude Desktop config with correct project identifier
- Restart Claude Desktop after config changes

### Tools return empty results

- Verify the project ID matches your database seed data
- Check that entities exist in the specified project
- Use `list_projects` to see all available projects

## 8. Available Tools

Once configured, you'll have access to these 6 tools:

1. **list_projects** - List all projects
2. **search_entities** - Search/filter entities
3. **get_entity** - Get single entity details
4. **get_entity_graph** - Get entity with relationship graph
5. **list_search_performance** - List GSC performance data
6. **list_quotable_blocks** - List GEO citation blocks

See `mcp/server/README.md` for detailed tool documentation.

## 9. Development Workflow

When making changes to the MCP server:

```bash
# 1. Make code changes in mcp/server/src/

# 2. Rebuild
cd mcp/server
npm run build

# 3. Restart Claude Desktop to load new version
```

For development with live reload:

```bash
# Terminal 1: Run backend
npm run dev

# Terminal 2: Test MCP server directly
cd mcp/server
npm run dev
```

## 10. Environment Variable Reference

**All environment variables must be set in Claude Desktop config, not in `.env` files.**

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PSYMETRIC_BASE_URL` | ✅ Yes | Backend API URL | `http://localhost:3000` |
| `PSYMETRIC_PROJECT_ID` | ⚠️ One of ID or SLUG | Project UUID | `00000000-0000-4000-a000-000000000001` |
| `PSYMETRIC_PROJECT_SLUG` | ⚠️ One of ID or SLUG | Project slug | `psymetric` |
| `PSYMETRIC_TIMEOUT_MS` | ❌ Optional | HTTP timeout (default 30000) | `30000` |

**Project Scope Rules:**
- Exactly ONE of `PSYMETRIC_PROJECT_ID` or `PSYMETRIC_PROJECT_SLUG` must be set
- Setting both → Fatal error at startup
- Setting neither → Fatal error at startup
- Invalid UUID format → Fatal error at startup

---

**Setup Complete!** Your API-backed MCP server is ready to use.
