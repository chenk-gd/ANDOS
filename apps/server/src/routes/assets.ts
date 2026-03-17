/**
 * Asset Routes - AI-Native DevOps Platform
 * REST API endpoints for asset management
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assetService } from '../services/AssetService';
import { ApiError, ValidationError, NotFoundError } from '../plugins/errorHandler';
import type { CreateAssetInput, UpdateAssetInput, AssetFilter, AssetState } from '../types/asset';
import type { AuthenticatedRequest } from '../types';

// Validation schemas
const CreateAssetSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  type: z.enum(['requirement', 'design', 'task', 'code', 'test', 'pipeline']),
  project_id: z.string().uuid(),
  team_id: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  owners: z.array(z.string().uuid()).optional(),
  auto_approval_enabled: z.boolean().optional(),
  auto_approval_threshold: z.enum(['off', 'high', 'medium', 'low']).optional(),
  metadata: z.record(z.any()).optional(),
});

const UpdateAssetSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  owners: z.array(z.string().uuid()).optional(),
  auto_approval_enabled: z.boolean().optional(),
  auto_approval_threshold: z.enum(['off', 'high', 'medium', 'low']).optional(),
}).strict();

const ListAssetsQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  type: z.enum(['requirement', 'design', 'task', 'code', 'test', 'pipeline']).optional(),
  state: z.enum(['draft', 'clean', 'dirty', 'modified', 'archived']).optional(),
  team_id: z.string().uuid().optional(),
  search: z.string().optional(),
  include_deleted: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).optional().default('20'),
});

// Route handlers
const assetRoutes: FastifyPluginAsync = async (fastify) => {
  // List assets
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = ListAssetsQuerySchema.parse(request.query);

    const filters: AssetFilter = {
      project_id: query.project_id,
      type: query.type,
      state: query.state,
      team_id: query.team_id,
      search: query.search,
      includeDeleted: query.include_deleted === 'true',
    };

    const assets = await assetService.list(filters);

    return {
      data: assets,
      meta: {
        total: assets.length,
        filters,
      },
    };
  });

  // Get asset by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const includeDeleted = request.query?.include_deleted === 'true';

    const asset = await assetService.getById(id, includeDeleted);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }

    return { data: asset };
  });

  // Create asset
  fastify.post('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const body = CreateAssetSchema.parse(request.body);

    // Check idempotency if key provided
    const idempotencyKey = request.checkIdempotency?.(body);

    // Get user ID from JWT (or use a default for now)
    const userId = request.user?.id || 'system';

    const input: CreateAssetInput = {
      ...body,
      created_by: userId,
    };

    const asset = await assetService.create(input);

    reply.status(201);
    return { data: asset };
  });

  // Update asset
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }> & AuthenticatedRequest, reply: FastifyReply) => {
    const { id } = request.params;
    const body = UpdateAssetSchema.parse(request.body);

    const userId = request.user?.id || 'system';

    const input: UpdateAssetInput = {
      ...body,
      updated_by: userId,
    };

    const asset = await assetService.update(id, input);

    return { data: asset };
  });

  // Soft delete asset
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }> & AuthenticatedRequest, reply: FastifyReply) => {
    const { id } = request.params;
    const cascade = request.query?.cascade === 'true';
    const userId = request.user?.id || 'system';

    await assetService.softDelete(id, {
      deleted_by: userId,
      cascade,
    });

    reply.status(204).send();
  });

  // Restore soft-deleted asset
  fastify.post('/:id/restore', async (request: FastifyRequest<{ Params: { id: string } }> & AuthenticatedRequest, reply: FastifyReply) => {
    const { id } = request.params;
    const userId = request.user?.id || 'system';

    const asset = await assetService.restore(id, userId);

    return { data: asset };
  });

  // List deleted assets
  fastify.get('/deleted', async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.query?.project_id as string | undefined;

    const assets = await assetService.listDeleted(projectId);

    return {
      data: assets,
      meta: {
        total: assets.length,
      },
    };
  });

  // Transition asset state
  fastify.post('/:id/transition', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { to_state: AssetState; reason?: string };
    }> & AuthenticatedRequest,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { to_state, reason } = request.body;
    const userId = request.user?.id || 'system';

    const validStates = ['draft', 'clean', 'dirty', 'modified', 'archived'] as const;
    if (!validStates.includes(to_state)) {
      throw new ValidationError('Invalid state', { valid_states: validStates });
    }

    const asset = await assetService.transitionState(id, to_state, {
      triggeredBy: 'user',
      actorId: userId,
      actorType: 'user',
      reason,
    });

    return { data: asset };
  });

  // Get asset versions
  fastify.get('/:id/versions', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const versions = await assetService.getVersions(id);

    return {
      data: versions,
      meta: {
        total: versions.length,
      },
    };
  });

  // Get upstream dependencies
  fastify.get('/:id/dependencies/upstream', async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: { version?: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const version = request.query?.version;

    const deps = await assetService.getUpstreamDependencies(id, version);

    return {
      data: deps,
      meta: {
        total: deps.length,
      },
    };
  });

  // Get downstream dependencies
  fastify.get('/:id/dependencies/downstream', async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: { version?: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const version = request.query?.version;

    const deps = await assetService.getDownstreamDependencies(id, version);

    return {
      data: deps,
      meta: {
        total: deps.length,
      },
    };
  });

  // Get descendants (using ltree)
  fastify.get('/:id/descendants', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const descendants = await assetService.getDescendants(id);

    return {
      data: descendants,
      meta: {
        total: descendants.length,
      },
    };
  });

  // Get ancestors (using ltree)
  fastify.get('/:id/ancestors', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const ancestors = await assetService.getAncestors(id);

    return {
      data: ancestors,
      meta: {
        total: ancestors.length,
      },
    };
  });
};

export default assetRoutes;
