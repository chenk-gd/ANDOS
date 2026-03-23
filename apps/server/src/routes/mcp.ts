/**
 * MCP Routes - Model Context Protocol Server
 * Implements MCP protocol over Server-Sent Events (SSE)
 *
 * Endpoints:
 * - GET /mcp/sse - SSE connection endpoint
 * - POST /mcp/messages - Message receiving endpoint
 *
 * Supports:
 * - Tools: memory_remember, memory_forget, memory_search
 * - Resources: memory://project/{id}, memory://session/{id}
 * - Prompts: Memory-aware prompts
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { mcpMemoryTools } from '../services/MCPMemoryTools';
import { projectMemoryService } from '../services/ProjectMemoryService';
import { sessionMemoryService } from '../services/SessionMemoryService';
import { kvMemoryService } from '../services/KVMemoryService';
import { ValidationError } from '@andos/shared-errors';
import type { MemoryLevel } from '../types/memory';

// ============================================================================
// MCP Protocol Types
// ============================================================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const MCPMessageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.any()).optional(),
});

const ToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.any()),
});

// ============================================================================
// SSE Connection Management
// ============================================================================

class SSEConnectionManager {
  private connections: Map<string, FastifyReply> = new Map();

  addConnection(sessionId: string, reply: FastifyReply): void {
    this.connections.set(sessionId, reply);
  }

  removeConnection(sessionId: string): void {
    this.connections.delete(sessionId);
  }

  getConnection(sessionId: string): FastifyReply | undefined {
    return this.connections.get(sessionId);
  }

  sendEvent(sessionId: string, event: string, data: any): boolean {
    const reply = this.connections.get(sessionId);
    if (!reply) {
      return false;
    }

    try {
      const eventData = JSON.stringify(data);
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${eventData}\n\n`);
      return true;
    } catch (error) {
      console.error('Failed to send SSE event:', error);
      return false;
    }
  }

  sendMessage(sessionId: string, message: MCPResponse): boolean {
    return this.sendEvent(sessionId, 'message', message);
  }

  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }
}

const sseManager = new SSEConnectionManager();

// ============================================================================
// MCP Protocol Handlers
// ============================================================================

/**
 * Handle initialize request
 */
async function handleInitialize(request: MCPRequest): Promise<MCPResponse> {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {
          subscribe: false,
          listChanged: false,
        },
        prompts: {},
      },
      serverInfo: {
        name: 'andos-mcp-server',
        version: '1.5.0',
      },
    },
  };
}

/**
 * Handle tools/list request
 */
async function handleToolsList(request: MCPRequest): Promise<MCPResponse> {
  const tools = mcpMemoryTools.listTools();

  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      tools,
    },
  };
}

/**
 * Handle tools/call request
 */
async function handleToolsCall(request: MCPRequest): Promise<MCPResponse> {
  const validation = ToolCallSchema.safeParse(request.params);

  if (!validation.success) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: ' + validation.error.message,
      },
    };
  }

  const { name, arguments: args } = validation.data;

  try {
    let result: any;

    switch (name) {
      case 'memory_remember':
        result = await mcpMemoryTools.remember({
          content: args.content,
          level: args.level as MemoryLevel,
          namespace: args.namespace,
          tags: args.tags,
          projectId: args.project_id,
          sessionId: args.session_id,
        });
        break;

      case 'memory_forget':
        result = await mcpMemoryTools.forget({
          key: args.key,
          level: args.level as MemoryLevel,
        });
        break;

      case 'memory_search':
        result = await mcpMemoryTools.search({
          query: args.query,
          level: args.level as MemoryLevel,
          limit: args.limit,
          projectId: args.project_id,
          sessionId: args.session_id,
        });
        break;

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Tool not found: ${name}`,
          },
        };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `Tool execution failed: ${errorMessage}`,
      },
    };
  }
}

/**
 * Handle resources/list request
 */
async function handleResourcesList(request: MCPRequest): Promise<MCPResponse> {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      resources: [
        {
          uri: 'memory://project/{projectId}',
          name: 'Project Memory',
          description: 'Project-level shared context and learned patterns',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://session/{sessionId}',
          name: 'Session Memory',
          description: 'Session-level key-value memories',
          mimeType: 'application/json',
        },
        {
          uri: 'memory://organization/{orgId}',
          name: 'Organization Memory',
          description: 'Organization-level shared memories',
          mimeType: 'application/json',
        },
      ],
    },
  };
}

/**
 * Handle resources/read request
 */
async function handleResourcesRead(request: MCPRequest): Promise<MCPResponse> {
  const { uri } = request.params || {};

  if (!uri || typeof uri !== 'string') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Missing or invalid uri parameter',
      },
    };
  }

  try {
    const match = uri.match(/^memory:\/\/(\w+)\/(.+)$/);
    if (!match) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: `Invalid memory URI format: ${uri}`,
        },
      };
    }

    const [, level, id] = match;
    let content: any;

    switch (level) {
      case 'project':
        const projectMemory = await projectMemoryService.getProjectMemory(id);
        const projectContext = await projectMemoryService.getProjectContext(id);
        const patterns = await projectMemoryService.getProjectPatterns(id);
        content = {
          ...projectMemory,
          shared_context: projectContext,
          patterns,
        };
        break;

      case 'session':
        const checkpoints = await sessionMemoryService.listCheckpoints(id);
        content = {
          session_id: id,
          checkpoints,
        };
        break;

      case 'organization':
        const orgMemories = await kvMemoryService.getByNamespace('default', { level: 'organization' });
        content = {
          organization_id: id,
          memories: orgMemories,
        };
        break;

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32602,
            message: `Unknown memory level: ${level}`,
          },
        };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2),
          },
        ],
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `Failed to read resource: ${errorMessage}`,
      },
    };
  }
}

/**
 * Handle prompts/list request
 */
async function handlePromptsList(request: MCPRequest): Promise<MCPResponse> {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      prompts: [
        {
          name: 'memory_context',
          description: 'Include relevant memory context in the conversation',
          arguments: [
            {
              name: 'project_id',
              description: 'Project ID to load context from',
              required: true,
            },
            {
              name: 'query',
              description: 'Query to search for relevant memories',
              required: false,
            },
          ],
        },
        {
          name: 'memory_assist',
          description: 'Get assistance based on learned patterns and previous decisions',
          arguments: [
            {
              name: 'task',
              description: 'Current task description',
              required: true,
            },
          ],
        },
      ],
    },
  };
}

/**
 * Handle prompts/get request
 */
async function handlePromptsGet(request: MCPRequest): Promise<MCPResponse> {
  const { name, arguments: args } = request.params || {};

  if (!name || typeof name !== 'string') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Missing or invalid prompt name',
      },
    };
  }

  try {
    let description: string;
    let messages: any[];

    switch (name) {
      case 'memory_context':
        const projectId = args?.project_id;
        if (!projectId) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32602,
              message: 'Missing required argument: project_id',
            },
          };
        }

        const context = await projectMemoryService.getProjectContext(projectId);
        const patterns = await projectMemoryService.getProjectPatterns(projectId);

        description = `Memory context for project ${projectId}`;
        messages = [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You have access to the following project context:\n\n${JSON.stringify(context, null, 2)}\n\nLearned patterns:\n${patterns.map(p => `- ${p.name}: ${p.description}`).join('\n')}`,
            },
          },
        ];
        break;

      case 'memory_assist':
        const task = args?.task || 'current task';
        description = `Memory-assisted guidance for: ${task}`;
        messages = [
          {
            role: 'system',
            content: {
              type: 'text',
              text: `You are assisting with the following task: ${task}. Use your learned patterns and project context to provide relevant guidance.`,
            },
          },
        ];
        break;

      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Prompt not found: ${name}`,
          },
        };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        description,
        messages,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `Failed to get prompt: ${errorMessage}`,
      },
    };
  }
}

/**
 * Route MCP request to appropriate handler
 */
async function routeMCPRequest(request: MCPRequest): Promise<MCPResponse> {
  switch (request.method) {
    case 'initialize':
      return await handleInitialize(request);
    case 'tools/list':
      return await handleToolsList(request);
    case 'tools/call':
      return await handleToolsCall(request);
    case 'resources/list':
      return await handleResourcesList(request);
    case 'resources/read':
      return await handleResourcesRead(request);
    case 'prompts/list':
      return await handlePromptsList(request);
    case 'prompts/get':
      return await handlePromptsGet(request);
    default:
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      };
  }
}

// ============================================================================
// Fastify Routes
// ============================================================================

const mcpRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================================================
  // SSE Endpoint - MCP Client connects here
  // ============================================================================
  fastify.get('/sse', async (request, reply) => {
    const sessionId = crypto.randomUUID();

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-MCP-Session-Id': sessionId,
    });

    // Register connection
    sseManager.addConnection(sessionId, reply);

    // Send endpoint event
    sseManager.sendEvent(sessionId, 'endpoint', {
      uri: `/mcp/messages?sessionId=${sessionId}`,
    });

    // Keep connection alive
    const keepAliveInterval = setInterval(() => {
      sseManager.sendEvent(sessionId, 'ping', {});
    }, 30000);

    // Handle connection close
    request.raw.on('close', () => {
      clearInterval(keepAliveInterval);
      sseManager.removeConnection(sessionId);
    });

    // Keep the response open
    await new Promise(() => {});
  });

  // ============================================================================
  // Messages Endpoint - Receive messages from MCP Client
  // ============================================================================
  fastify.post('/messages', async (request: FastifyRequest<{ Querystring: { sessionId: string } }>, reply) => {
    const { sessionId } = request.query;

    if (!sessionId) {
      return reply.status(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Missing sessionId query parameter',
        },
      });
    }

    // Validate request body
    const validation = MCPMessageSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error: ' + validation.error.message,
        },
      });
    }

    const mcpRequest = validation.data;

    // Route the request
    const response = await routeMCPRequest(mcpRequest);

    // Send response via SSE if connection exists
    const sent = sseManager.sendMessage(sessionId, response);

    if (!sent) {
      return reply.status(404).send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found or connection closed',
        },
      });
    }

    // Return 202 Accepted (response sent via SSE)
    return reply.status(202).send({
      jsonrpc: '2.0',
      id: mcpRequest.id,
      result: {},
    });
  });

  // ============================================================================
  // Health Check
  // ============================================================================
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'healthy',
      protocol: 'mcp',
      version: '1.5.0',
      connections: sseManager.getActiveConnections().length,
    });
  });
};

export default mcpRoutes;
export { sseManager, routeMCPRequest };
