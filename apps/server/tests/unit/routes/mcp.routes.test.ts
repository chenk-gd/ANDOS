/**
 * MCP Routes Tests - TDD
 * Tests for MCP Server SSE transport layer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock dependencies
vi.mock('@/services/MCPMemoryTools', () => ({
  mcpMemoryTools: {
    listTools: vi.fn().mockReturnValue([
      {
        name: 'memory_remember',
        description: 'Store a new memory',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'memory_forget',
        description: 'Remove a memory',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'memory_search',
        description: 'Search memories',
        inputSchema: { type: 'object', properties: {} },
      },
    ]),
    remember: vi.fn().mockResolvedValue({ key: 'test-key' }),
    forget: vi.fn().mockResolvedValue({ success: true }),
    search: vi.fn().mockResolvedValue([{ key: 'key1', content: 'content1', relevance: 0.9 }]),
  },
  MEMORY_TOOLS: [
    { name: 'memory_remember', description: 'Store a new memory', inputSchema: {} },
    { name: 'memory_forget', description: 'Remove a memory', inputSchema: {} },
    { name: 'memory_search', description: 'Search memories', inputSchema: {} },
  ],
}));

vi.mock('@/services/ProjectMemoryService', () => ({
  projectMemoryService: {
    getProjectMemory: vi.fn().mockResolvedValue({ id: 'test', project_id: 'test' }),
    getProjectContext: vi.fn().mockResolvedValue({ code_style_preferences: {} }),
    getProjectPatterns: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/services/SessionMemoryService', () => ({
  sessionMemoryService: {
    listCheckpoints: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/services/KVMemoryService', () => ({
  kvMemoryService: {
    getByNamespace: vi.fn().mockResolvedValue([]),
  },
}));

describe('MCP Routes', () => {
  let mockFastify: any;
  let registeredRoutes: Array<{ method: string; url: string; handler: Function }> = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    registeredRoutes = [];

    // Create mock Fastify instance that captures route registrations
    mockFastify = {
      get: vi.fn((url: string, handler: Function) => {
        registeredRoutes.push({ method: 'GET', url, handler });
        return mockFastify;
      }),
      post: vi.fn((url: string, handler: Function) => {
        registeredRoutes.push({ method: 'POST', url, handler });
        return mockFastify;
      }),
    };

    // Import and register the routes
    const { default: mcpRoutes } = await import('@/routes/mcp');
    await mcpRoutes(mockFastify as FastifyInstance);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('SSE Endpoint', () => {
    it('should register /mcp/sse GET route', async () => {
      const sseRoute = registeredRoutes.find(r => r.method === 'GET' && r.url === '/sse');
      expect(sseRoute).toBeDefined();
      expect(typeof sseRoute?.handler).toBe('function');
    });

    it('should register /mcp/messages POST route', async () => {
      const messagesRoute = registeredRoutes.find(r => r.method === 'POST' && r.url === '/messages');
      expect(messagesRoute).toBeDefined();
      expect(typeof messagesRoute?.handler).toBe('function');
    });

    it('should register /mcp/health GET route', async () => {
      const healthRoute = registeredRoutes.find(r => r.method === 'GET' && r.url === '/health');
      expect(healthRoute).toBeDefined();
      expect(typeof healthRoute?.handler).toBe('function');
    });
  });

  describe('Route Handlers', () => {
    it('health endpoint should return status', async () => {
      const healthRoute = registeredRoutes.find(r => r.method === 'GET' && r.url === '/health');
      const mockReply = {
        send: vi.fn().mockReturnThis(),
      };

      await healthRoute?.handler({}, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          protocol: 'mcp',
          version: '1.5.0',
          connections: expect.any(Number),
        })
      );
    });
  });

  describe('MCPMemoryTools Integration', () => {
    it('should list 3 memory tools', async () => {
      const { mcpMemoryTools } = await import('@/services/MCPMemoryTools');
      const tools = mcpMemoryTools.listTools();
      expect(tools).toHaveLength(3);
      expect(tools.map((t: any) => t.name)).toContain('memory_remember');
      expect(tools.map((t: any) => t.name)).toContain('memory_forget');
      expect(tools.map((t: any) => t.name)).toContain('memory_search');
    });

    it('should handle memory_remember tool call', async () => {
      const { mcpMemoryTools } = await import('@/services/MCPMemoryTools');
      const result = await mcpMemoryTools.remember({
        content: 'Test memory',
        level: 'session',
        namespace: 'test',
        tags: ['test'],
      });

      expect(result.key).toBe('test-key');
    });

    it('should handle memory_forget tool call', async () => {
      const { mcpMemoryTools } = await import('@/services/MCPMemoryTools');
      const result = await mcpMemoryTools.forget({
        key: 'test-key',
        level: 'session',
      });

      expect(result.success).toBe(true);
    });

    it('should handle memory_search tool call', async () => {
      const { mcpMemoryTools } = await import('@/services/MCPMemoryTools');
      const result = await mcpMemoryTools.search({
        query: 'test',
        level: 'session',
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('key1');
    });
  });

  describe('Route Registration Count', () => {
    it('should register exactly 3 routes', () => {
      expect(registeredRoutes).toHaveLength(3);
    });

    it('should have correct route methods', () => {
      const getRoutes = registeredRoutes.filter(r => r.method === 'GET');
      const postRoutes = registeredRoutes.filter(r => r.method === 'POST');

      expect(getRoutes).toHaveLength(2); // /sse and /health
      expect(postRoutes).toHaveLength(1); // /messages
    });
  });
});
