#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { PsyMetricService } from './service.js';
import { 
  searchEntitiesSchema, 
  getEntitySchema, 
  getEntityGraphSchema 
} from './schemas.js';
import { MCPServerError } from './errors.js';
import { logger } from './logger.js';

class PsyMetricMCPServer {
  private server: Server;
  private service: PsyMetricService;

  constructor() {
    this.server = new Server(
      {
        name: 'psymetric-mcp-server',
        version: '1.0.0',
      }
    );

    this.service = new PsyMetricService();
    this.setupToolHandlers();
    this.setupErrorHandler();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_projects',
            description: 'Enumerate projects accessible to this MCP server instance',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'search_entities',
            description: 'Search entities within a specific project using text matching',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: { type: 'string', format: 'uuid' },
                query: { type: 'string', minLength: 1, maxLength: 256 },
                entityTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['guide', 'concept', 'project', 'news']
                  },
                  uniqueItems: true,
                  maxItems: 4
                },
                limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }
              },
              required: ['projectId', 'query'],
              additionalProperties: false,
            },
          },
          {
            name: 'get_entity',
            description: 'Retrieve complete details for a specific entity within a project',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: { type: 'string', format: 'uuid' },
                entityId: { type: 'string', format: 'uuid' }
              },
              required: ['projectId', 'entityId'],
              additionalProperties: false,
            },
          },
          {
            name: 'get_entity_graph',
            description: 'Retrieve entity with connected relationships up to specified depth',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: { type: 'string', format: 'uuid' },
                entityId: { type: 'string', format: 'uuid' },
                depth: { type: 'integer', minimum: 1, maximum: 2, default: 1 },
                relationshipTypes: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: [
                      'GUIDE_USES_CONCEPT',
                      'GUIDE_EXPLAINS_CONCEPT', 
                      'GUIDE_REFERENCES_SOURCE',
                      'CONCEPT_RELATES_TO_CONCEPT',
                      'CONCEPT_REFERENCES_SOURCE',
                      'NEWS_DERIVED_FROM_SOURCE',
                      'NEWS_REFERENCES_SOURCE',
                      'NEWS_REFERENCES_CONCEPT',
                      'PROJECT_IMPLEMENTS_CONCEPT',
                      'PROJECT_REFERENCES_SOURCE',
                      'PROJECT_HAS_GUIDE',
                      'DISTRIBUTION_PROMOTES_GUIDE',
                      'DISTRIBUTION_PROMOTES_CONCEPT',
                      'DISTRIBUTION_PROMOTES_PROJECT',
                      'DISTRIBUTION_PROMOTES_NEWS',
                      'VIDEO_EXPLAINS_GUIDE',
                      'VIDEO_EXPLAINS_CONCEPT',
                      'VIDEO_EXPLAINS_PROJECT',
                      'VIDEO_EXPLAINS_NEWS'
                    ]
                  },
                  uniqueItems: true,
                  maxItems: 50
                }
              },
              required: ['projectId', 'entityId'],
              additionalProperties: false,
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_projects': {
            const result = await Promise.race([
              this.service.listProjects(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'search_entities': {
            const input = searchEntitiesSchema.parse(args);
            const result = await Promise.race([
              this.service.searchEntities(input),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'get_entity': {
            const input = getEntitySchema.parse(args);
            const result = await Promise.race([
              this.service.getEntity(input),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          case 'get_entity_graph': {
            const input = getEntityGraphSchema.parse(args);
            const result = await Promise.race([
              this.service.getEntityGraph(input),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 30000)
              )
            ]);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error(`tool_call_${name}`, error as Error);

        if (error instanceof MCPServerError) {
          const mcpError = error.toJSON();
          throw new McpError(ErrorCode.InternalError, mcpError.error.message);
        }

        if (error instanceof Error) {
          if (error.message === 'Timeout') {
            throw new McpError(ErrorCode.InternalError, 'Tool execution timeout');
          }
          if (error.name === 'ZodError') {
            throw new McpError(ErrorCode.InvalidParams, 'Invalid input parameters');
          }
        }

        throw new McpError(ErrorCode.InternalError, 'Internal server error');
      }
    });
  }

  private setupErrorHandler(): void {
    this.server.onerror = (error) => {
      logger.error('mcp_server_error', error);
    };
  }

  async run(): Promise<void> {
    try {
      await this.service.initialize();
      logger.info('server_starting');

      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info('server_started');

      // Setup cleanup
      process.on('SIGINT', async () => {
        logger.info('server_shutting_down');
        await this.service.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('server_shutting_down');
        await this.service.shutdown();
        process.exit(0);
      });

    } catch (error) {
      logger.error('server_startup_failed', error as Error);
      process.exit(1);
    }
  }
}

// Start server
const server = new PsyMetricMCPServer();
server.run().catch((error) => {
  logger.error('server_fatal_error', error);
  process.exit(1);
});
