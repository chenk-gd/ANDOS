/**
 * Graph Routes Tests
 * Tests for dependency graph visualization endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock the error handler plugin
vi.mock('@/plugins/errorHandler', () => {
  const fp = (fn: Function) => fn;

  const errorHandlerPlugin = async (fastify: any) => {
    fastify.setErrorHandler((error: any, request: any, reply: any) => {
      if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
        reply.status(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      } else {
        reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: error.message },
        });
      }
    });
  };

  return {
    default: fp(errorHandlerPlugin),
    NotFoundError: class NotFoundError extends Error {
      constructor(resource: string, id: string) {
        super(`${resource} with id '${id}' not found`);
        this.name = 'NotFoundError';
      }
    },
  };
});

// Mock DependencyGraphService
vi.mock('@/services/DependencyGraphService', () => ({
  dependencyGraphService: {
    buildGraph: vi.fn().mockImplementation((assetId: string, options: any) => {
      return Promise.resolve({
        nodes: [
          {
            id: assetId,
            type: 'service',
            name: 'Root Service',
            slug: 'root-service',
            state: 'clean',
            version: '1.0.0',
            depth: 0,
            metadata: { isRoot: true, isLeaf: false, hasDirtyUpstream: false },
          },
          {
            id: 'asset-2',
            type: 'api',
            name: 'API Gateway',
            slug: 'api-gateway',
            state: 'clean',
            version: '2.0.0',
            depth: 1,
            metadata: { isRoot: false, isLeaf: false, hasDirtyUpstream: false },
          },
          {
            id: 'asset-3',
            type: 'database',
            name: 'Database',
            slug: 'database',
            state: 'dirty',
            version: '1.5.0',
            depth: 2,
            metadata: { isRoot: false, isLeaf: true, hasDirtyUpstream: true },
          },
        ],
        edges: [
          { id: 'edge-1', source: 'asset-2', target: assetId, sourceVersion: '2.0.0', targetVersion: '1.0.0', confirmed: true },
          { id: 'edge-2', source: 'asset-3', target: 'asset-2', sourceVersion: '1.5.0', targetVersion: '2.0.0', confirmed: true },
        ],
        rootId: assetId,
        maxDepth: 2,
        cyclic: false,
        stats: {
          totalNodes: 3,
          totalEdges: 2,
          leafNodes: 1,
          dirtyNodes: 1,
          byType: { service: 1, api: 1, database: 1 },
          byState: { clean: 2, dirty: 1 },
        },
      });
    }),
    buildCytoscapeGraph: vi.fn().mockResolvedValue({
      elements: [
        { data: { id: 'asset-1', label: 'Root Service', type: 'service' } },
        { data: { id: 'asset-2', label: 'API Gateway', type: 'api' } },
        { data: { id: 'asset-3', label: 'Database', type: 'database' } },
        { data: { id: 'edge-1', source: 'asset-2', target: 'asset-1' } },
        { data: { id: 'edge-2', source: 'asset-3', target: 'asset-2' } },
      ],
      style: [{ selector: 'node', style: { 'background-color': '#666' } }],
      layout: { name: 'dagre', padding: 10 },
    }),
    buildMermaidGraph: vi.fn().mockResolvedValue(
      'graph TD\n  asset-1["Root Service"]:::root\n  asset-2["API Gateway"]\n  asset-3["Database"]:::dirty\n  asset-2 --> asset-1\n  asset-3 --> asset-2\n  classDef root fill:#3498db,stroke:#2980b9,stroke-width:3px\n  classDef dirty fill:#e74c3c,stroke:#c0392b'
    ),
    buildDotGraph: vi.fn().mockResolvedValue(
      'digraph DependencyGraph {\n  rankdir=TB;\n  node [shape=box, style=rounded];\n  "asset-1" [label="Root Service", fillcolor="#3498db", style=filled, fontcolor=white];\n  "asset-2" [label="API Gateway", fillcolor="#666666", style=filled, fontcolor=white];\n}'
    ),
    analyzeImpact: vi.fn().mockResolvedValue({
      affectedAssets: [
        { assetId: 'asset-2', name: 'API Gateway', depth: 1, impactLevel: 'high', paths: [['asset-1', 'asset-2']] },
        { assetId: 'asset-3', name: 'Database', depth: 2, impactLevel: 'medium', paths: [['asset-1', 'asset-2', 'asset-3']] },
      ],
      summary: {
        totalAffected: 2,
        byDepth: { 1: 1, 2: 1 },
        byImpactLevel: { high: 1, medium: 1, low: 0 },
        criticalPaths: [['asset-1', 'asset-2']],
      },
    }),
  },
}));

// Mock AssetService
vi.mock('@/services/AssetService', () => ({
  assetService: {
    getById: vi.fn().mockImplementation((id: string) => {
      if (id === 'non-existent') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id,
        name: 'Test Asset',
        slug: 'test-asset',
        type: 'service',
        state: 'clean',
        current_version: '1.0.0',
      });
    }),
  },
}));

// Import after mocks
import graphRoutes from '@/routes/graph';
import errorHandler from '@/plugins/errorHandler';
import { dependencyGraphService } from '@/services/DependencyGraphService';
import { assetService } from '@/services/AssetService';

describe('Graph Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    // Register error handler to properly transform errors
    await app.register(errorHandler);
    await app.register(graphRoutes, { prefix: '/' });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should have graph routes registered', async () => {
      // Test graph endpoint
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph',
      });

      // Should not be 404 (route exists)
      expect(response.statusCode).not.toBe(404);
    });
  });

  describe('GET /:id/graph - Get Dependency Graph', () => {
    it('should get dependency graph in JSON format by default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith('asset-1', {
        direction: 'both',
        maxDepth: 10,
        layout: 'hierarchical',
        includeVersions: false,
        filterTypes: undefined,
        filterStates: undefined,
      });

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it('should get graph in Cytoscape format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph?format=cytoscape',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildCytoscapeGraph).toHaveBeenCalled();
    });

    it('should get graph in Mermaid format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph?format=mermaid',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildMermaidGraph).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.data.mermaid).toBeDefined();
    });

    it('should get graph in DOT format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph?format=dot',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildDotGraph).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.data.dot).toBeDefined();
    });

    it('should support direction filtering', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/graph?direction=downstream',
      });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ direction: 'downstream' })
      );
    });

    it('should support max_depth parameter', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/graph?max_depth=5',
      });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ maxDepth: 5 })
      );
    });

    it('should support filter_types parameter', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/graph?filter_types=service,api',
      });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ filterTypes: ['service', 'api'] })
      );
    });

    it('should support filter_states parameter', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/graph?filter_states=clean,dirty',
      });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ filterStates: ['clean', 'dirty'] })
      );
    });

    it('should handle non-existent asset', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent/graph',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should include metadata in JSON response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph',
      });

      const body = JSON.parse(response.body);
      expect(body.meta).toBeDefined();
      expect(body.meta.asset_id).toBe('asset-1');
      expect(body.meta.asset_name).toBe('Test Asset');
      expect(body.meta.format).toBe('json');
    });
  });

  describe('GET /:id/impact - Get Impact Analysis', () => {
    it('should get impact analysis for an asset', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/impact',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.analyzeImpact).toHaveBeenCalledWith('asset-1', undefined);
    });

    it('should support version parameter', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/impact?version=2.0.0',
      });

      expect(dependencyGraphService.analyzeImpact).toHaveBeenCalledWith('asset-1', '2.0.0');
    });

    it('should return impact data with metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/impact',
      });

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.affectedAssets).toBeDefined();
      expect(body.data.summary).toBeDefined();
      expect(body.meta).toBeDefined();
    });

    it('should handle non-existent asset for impact', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent/impact',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /:id/graph/stats - Get Graph Statistics', () => {
    it('should get graph statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph/stats',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ direction: undefined, maxDepth: 10 })
      );
    });

    it('should support direction parameter', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/graph/stats?direction=upstream',
      });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ direction: 'upstream' })
      );
    });

    it('should return stats in correct format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph/stats',
      });

      const body = JSON.parse(response.body);
      expect(body.data.stats).toBeDefined();
      expect(body.data.maxDepth).toBeDefined();
      expect(body.data.cyclic).toBeDefined();
      expect(body.data.stats.totalNodes).toBe(3);
      expect(body.data.stats.totalEdges).toBe(2);
    });

    it('should handle non-existent asset for stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent/graph/stats',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /:id/graph/export - Export Graph', () => {
    it('should export graph as JSON by default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph/export',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildGraph).toHaveBeenCalled();
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should export graph as Mermaid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph/export?format=mermaid',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildMermaidGraph).toHaveBeenCalled();
      expect(response.headers['content-type']).toBe('text/plain');
    });

    it('should export graph as DOT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/asset-1/graph/export?format=dot',
      });

      expect(response.statusCode).toBe(200);
      expect(dependencyGraphService.buildDotGraph).toHaveBeenCalled();
      expect(response.headers['content-type']).toBe('text/plain');
    });

    it('should support direction and max_depth parameters', async () => {
      await app.inject({
        method: 'GET',
        url: '/asset-1/graph/export?format=json&direction=downstream&max_depth=5',
      });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ direction: 'downstream', maxDepth: 5 })
      );
    });

    it('should handle non-existent asset for export', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent/graph/export',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
