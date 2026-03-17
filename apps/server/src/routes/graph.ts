/**
 * Dependency Graph Routes - AI-Native DevOps Platform
 * REST API endpoints for visualizing asset dependency graphs
 *
 * V1.5: Visualization dependency graph API
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { dependencyGraphService, LayoutAlgorithm } from '../services/DependencyGraphService';
import { NotFoundError } from '../plugins/errorHandler';
import { assetService } from '../services/AssetService';

// Validation schemas
const GraphQuerySchema = z.object({
  direction: z.enum(['upstream', 'downstream', 'both']).optional().default('both'),
  max_depth: z.string().regex(/^\d+$/).optional().default('10'),
  layout: z.enum(['hierarchical', 'force', 'circular', 'dagre']).optional().default('hierarchical'),
  format: z.enum(['json', 'cytoscape', 'mermaid', 'dot']).optional().default('json'),
  include_versions: z.enum(['true', 'false']).optional().default('false'),
  filter_types: z.string().optional(), // comma-separated list
  filter_states: z.string().optional(), // comma-separated list
});

const ImpactQuerySchema = z.object({
  version: z.string().optional(),
});

// Route handlers
const graphRoutes: FastifyPluginAsync = async (fastify) => {
  // Get dependency graph for an asset
  fastify.get('/:id/graph', async (
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: {
        direction?: string;
        max_depth?: string;
        layout?: string;
        format?: string;
        include_versions?: string;
        filter_types?: string;
        filter_states?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const query = GraphQuerySchema.parse(request.query);

    // Verify asset exists
    const asset = await assetService.getById(id);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }

    const options = {
      direction: query.direction as 'upstream' | 'downstream' | 'both',
      maxDepth: parseInt(query.max_depth, 10),
      layout: query.layout as LayoutAlgorithm,
      includeVersions: query.include_versions === 'true',
      filterTypes: query.filter_types?.split(',').filter(Boolean),
      filterStates: query.filter_states?.split(',').filter(Boolean),
    };

    // Return in requested format
    switch (query.format) {
      case 'cytoscape': {
        const graph = await dependencyGraphService.buildCytoscapeGraph(id, options);
        return { data: graph };
      }
      case 'mermaid': {
        const graph = await dependencyGraphService.buildMermaidGraph(id, options);
        return {
          data: {
            mermaid: graph,
            asset_id: id,
          },
        };
      }
      case 'dot': {
        const graph = await dependencyGraphService.buildDotGraph(id, options);
        return {
          data: {
            dot: graph,
            asset_id: id,
          },
        };
      }
      default: {
        const graph = await dependencyGraphService.buildGraph(id, options);
        return {
          data: graph,
          meta: {
            asset_id: id,
            asset_name: asset.name,
            format: 'json',
          },
        };
      }
    }
  });

  // Get impact analysis for an asset
  fastify.get('/:id/impact', async (
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: { version?: string };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const query = ImpactQuerySchema.parse(request.query);

    // Verify asset exists
    const asset = await assetService.getById(id);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }

    const impact = await dependencyGraphService.analyzeImpact(id, query.version);

    return {
      data: impact,
      meta: {
        asset_id: id,
        asset_name: asset.name,
        version: query.version || asset.current_version,
      },
    };
  });

  // Get graph statistics
  fastify.get('/:id/graph/stats', async (
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: {
        direction?: string;
        max_depth?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const direction = request.query?.direction as 'upstream' | 'downstream' | 'both' | undefined;
    const maxDepth = parseInt(request.query?.max_depth || '10', 10);

    // Verify asset exists
    const asset = await assetService.getById(id);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }

    const graph = await dependencyGraphService.buildGraph(id, {
      direction,
      maxDepth,
    });

    return {
      data: {
        stats: graph.stats,
        maxDepth: graph.maxDepth,
        cyclic: graph.cyclic,
      },
      meta: {
        asset_id: id,
        asset_name: asset.name,
      },
    };
  });

  // Export graph in specific format
  fastify.get('/:id/graph/export', async (
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: {
        format: 'mermaid' | 'dot' | 'json';
        direction?: string;
        max_depth?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const format = request.query?.format || 'json';
    const direction = (request.query?.direction as 'upstream' | 'downstream' | 'both') || 'both';
    const maxDepth = parseInt(request.query?.max_depth || '10', 10);

    // Verify asset exists
    const asset = await assetService.getById(id);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }

    const options = { direction, maxDepth };

    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'mermaid': {
        content = await dependencyGraphService.buildMermaidGraph(id, options);
        contentType = 'text/plain';
        filename = `dependency-graph-${asset.slug}.mmd`;
        break;
      }
      case 'dot': {
        content = await dependencyGraphService.buildDotGraph(id, options);
        contentType = 'text/plain';
        filename = `dependency-graph-${asset.slug}.dot`;
        break;
      }
      case 'json':
      default: {
        const graph = await dependencyGraphService.buildGraph(id, options);
        content = JSON.stringify(graph, null, 2);
        contentType = 'application/json';
        filename = `dependency-graph-${asset.slug}.json`;
        break;
      }
    }

    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(content);
  });
};

export default graphRoutes;
