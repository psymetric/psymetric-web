#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { createApiClient, validateConfig } from "./api-client.js";
import { toolDefinitions } from "./tools.js";
import { handleToolCall } from "./tool-handlers.js";

async function main() {
  // Validate configuration at startup (fail fast)
  const config = validateConfig();

  console.error(
    `[PsyMetric MCP] Starting server with project scope: ${config.projectScope.type}=${config.projectScope.value}`
  );

  // Create API client
  const apiClient = createApiClient(config);

  // Create MCP server
  const server = new Server(
    {
      name: "psymetric-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions as Tool[],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleToolCall(request.params.name, request.params.arguments ?? {}, apiClient);
    } catch (error) {
      console.error(`[PsyMetric MCP] Tool execution error:`, error);
      throw error;
    }
  });

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[PsyMetric MCP] Server running on stdio");
}

main().catch((error) => {
  console.error("[PsyMetric MCP] Fatal error:", error);
  process.exit(1);
});
