/**
 * Version Routes - AI-Native DevOps Platform
 * REST API endpoints for asset version management
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { assetService } from '../services/AssetService';
import { NotFoundError } from '../plugins/errorHandler';
import type { CreateVersionInput } from '../types/asset';
import type { AuthenticatedRequest } from '../types';

// Validation schemas
const CreateVersionSchema = z.object({
  version: z.string().min(1).max(50),
  content_ref: z.string().min(1).max(500),
  content_hash: z.string().max(64).optional(),
  content_size: z.number().int().optional(),
  changelog: z.string().min(1),
  changelog_summary: z.string().max(500).optional(),
});

const versionRoutes: FastifyPluginAsync = async (fastify) => {
  // Create version for an asset
  fastify.post('/:assetId/versions', async (
    request: FastifyRequest<{ Params: { assetId: string } }> & AuthenticatedRequest,
    reply: FastifyReply
  ) => {
    const { assetId } = request.params;
    const body = CreateVersionSchema.parse(request.body);
    const userId = request.user?.id || 'system';

    // Verify asset exists
    const asset = await assetService.getById(assetId);
    if (!asset) {
      throw new NotFoundError('Asset', assetId);
    }

    const input: CreateVersionInput = {
      asset_id: assetId,
      ...body,
      created_by: userId,
    };

    const version = await assetService.createVersion(input);

    reply.status(201);
    return { data: version };
  });

  // Publish a version
  fastify.post('/:assetId/versions/:version/publish', async (
    request: FastifyRequest<{ Params: { assetId: string; version: string } }> & AuthenticatedRequest,
    reply: FastifyReply
  ) => {
    const { assetId, version } = request.params;
    const userId = request.user?.id || 'system';

    const published = await assetService.publishVersion(assetId, version, userId);

    return { data: published };
  });

  // Get a specific version
  fastify.get('/:assetId/versions/:version', async (
    request: FastifyRequest<{ Params: { assetId: string; version: string } }>,
    reply: FastifyReply
  ) => {
    const { assetId, version } = request.params;

    const versions = await assetService.getVersions(assetId);
    const found = versions.find(v => v.version === version);

    if (!found) {
      throw new NotFoundError('Version', `${assetId}:${version}`);
    }

    return { data: found };
  });
};

export default versionRoutes;
