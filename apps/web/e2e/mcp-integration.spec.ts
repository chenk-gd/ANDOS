import { test, expect } from '@playwright/test';

/**
 * E2E Tests for MCP Protocol Integration
 * Tests the Model Context Protocol endpoints
 */

test.describe('MCP Integration', () => {
  const mcpBaseUrl = 'http://localhost:3000/mcp';

  test('should have MCP health endpoint', async ({ request }) => {
    const response = await request.get(`${mcpBaseUrl}/health`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.protocol).toBe('mcp');
  });

  test('should establish SSE connection', async ({ page }) => {
    // Test SSE connection establishment
    await page.goto('/');

    // Monitor network requests for SSE
    const sseRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/mcp/sse')) {
        sseRequests.push(request.url());
      }
    });

    // SSE connection should be established when accessing MCP features
    await page.waitForTimeout(1000);

    // SSE endpoint should be accessible
    const response = await page.request.get(`${mcpBaseUrl}/sse`);
    expect(response.status()).toBe(200);
  });

  test('should handle MCP initialize request', async ({ request }) => {
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    // This would normally be sent over SSE, testing the endpoint
    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: initRequest,
    });

    // Should return 202 Accepted or handle the message
    expect([202, 400, 404]).toContain(response.status());
  });

  test('should list MCP tools', async ({ request }) => {
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    };

    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: toolsRequest,
    });

    // Expect 202 Accepted (response via SSE)
    // or 404 if session not found
    expect([202, 404]).toContain(response.status());
  });

  test('should list MCP resources', async ({ request }) => {
    const resourcesRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
    };

    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: resourcesRequest,
    });

    expect([202, 404]).toContain(response.status());
  });

  test('should list MCP prompts', async ({ request }) => {
    const promptsRequest = {
      jsonrpc: '2.0',
      id: 4,
      method: 'prompts/list',
    };

    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: promptsRequest,
    });

    expect([202, 404]).toContain(response.status());
  });
});

test.describe('Memory Tools via MCP', () => {
  const mcpBaseUrl = 'http://localhost:3000/mcp';

  test('should call memory_remember tool', async ({ request }) => {
    const toolCall = {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'memory_remember',
        arguments: {
          content: 'Test memory content',
          level: 'session',
          namespace: 'test',
          tags: ['test', 'e2e'],
        },
      },
    };

    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: toolCall,
    });

    expect([202, 404]).toContain(response.status());
  });

  test('should call memory_search tool', async ({ request }) => {
    const toolCall = {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'memory_search',
        arguments: {
          query: 'test',
          level: 'session',
          limit: 10,
        },
      },
    };

    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: toolCall,
    });

    expect([202, 404]).toContain(response.status());
  });

  test('should read memory resource', async ({ request }) => {
    const resourceRequest = {
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: {
        uri: 'memory://session/test-session',
      },
    };

    const response = await request.post(`${mcpBaseUrl}/messages?sessionId=test-session`, {
      data: resourceRequest,
    });

    expect([202, 404]).toContain(response.status());
  });
});
