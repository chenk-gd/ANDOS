/**
 * Dependency Routes - AI-Native DevOps Platform
 * REST API endpoints for dependency management
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assetService } from '../services/AssetService';
import { NotFoundError } from '../plugins/errorHandler';
import type { CreateDependencyInput } from '../types/asset';
import type { AuthenticatedRequest } from '../types';

// Validation schemas
const CreateDependencySchema = z.object({
  source_asset_id: z.string().uuid(),
  source_version: z.string().min(1).max(50),
  target_asset_id: z.string().uuid(),
  target_version: z.string().min(1).max(50),
  auto_confirmed: z.boolean().optional(),
});

const dependencyRoutes: FastifyPluginAsync = async (fastify) => {
  // Create dependency
  fastify.post('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const body = CreateDependencySchema.parse(request.body);
    const userId = request.user?.id || 'system';

    // Verify both assets exist
    const sourceAsset = await assetService.getById(body.source_asset_id);
    if (!sourceAsset) {
      throw new NotFoundError('Asset', body.source_asset_id);
    }

    const targetAsset = await assetService.getById(body.target_asset_id);
    if (!targetAsset) {
      throw new NotFoundError('Asset', body.target_asset_id);
    }

    const input: CreateDependencyInput = {
      ...body,
      confirmed_by: body.auto_confirmed ? undefined : userId,
    };

    const dependency = await assetService.createDependency(input);

    reply.status(201);
    return { data: dependency };
  });

  // Remove dependency
  fastify.delete('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      source_asset_id: string;
      source_version: string;
      target_asset_id: string;
      target_version: string;
    };

    await assetService.removeDependency(
      query.source_asset_id,
      query.source_version,
      query.target_asset_id,
      query.target_version
    );

    reply.status(204).send();
  });

  // Get upstream dependencies for an asset
  fastify.get('/upstream/:assetId', async (
    request: FastifyRequest<{ Params: { assetId: string }; Querystring: { version?: string } }>,
    reply: FastifyReply
  ) => {
    const { assetId } = request.params;
    const version = request.query?.version;

    const deps = await assetService.getUpstreamDependencies(assetId, version);

    return {
      data: deps,
      meta: {
        total: deps.length,
      },
    };
  });

  // Get downstream dependencies for an asset
  fastify.get('/downstream/:assetId', async (
    request: FastifyRequest<{ Params: { assetId: string }; Querystring: { version?: string } }>,
    reply: FastifyReply
  ) => {
    const { assetId } = request.params;
    const version = request.query?.version;

    const deps = await assetService.getDownstreamDependencies(assetId, version);

    return {
      data: deps,
      meta: {
        total: deps.length,
      },
    };
  });
};

export default dependencyRoutes;
