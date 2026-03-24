/**
 * AssetService - AI-Native DevOps Platform
 * Business logic for asset management with soft delete support
 *
 * P0: Business logic moved from database triggers to application layer
 */

import { db, withTransaction } from '../db/connection';
import { webhookService } from './WebhookService';
import { logger } from '../utils/logger';
import {
  Asset,
  AssetState,
  AssetVersion,
  VersionState,
  Dependency,
  AssetStateTransition,
  DirtySource,
  CreateAssetInput,
  UpdateAssetInput,
  CreateVersionInput,
  CreateDependencyInput,
  AssetFilter,
  SoftDeleteOptions,
} from '../types/asset';

// Error types
export class AssetError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AssetError';
  }
}

export class AssetNotFoundError extends AssetError {
  constructor(assetId: string) {
    super(`Asset not found: ${assetId}`, 'ASSET_NOT_FOUND');
    this.name = 'AssetNotFoundError';
  }
}

export class AssetHasDependenciesError extends AssetError {
  constructor(assetId: string, depsCount: number) {
    super(
      `Cannot delete asset ${assetId}: has ${depsCount} active dependencies. Use force delete or cascade option.`,
      'HAS_DEPENDENCIES'
    );
    this.name = 'AssetHasDependenciesError';
  }
}

export class DuplicateSlugError extends AssetError {
  constructor(slug: string, projectId: string) {
    super(`Slug '${slug}' already exists in project ${projectId}`, 'DUPLICATE_SLUG');
    this.name = 'DuplicateSlugError';
  }
}

export class InvalidStateTransitionError extends AssetError {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} -> ${to}`, 'INVALID_STATE_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

export class AssetService {
  // ==================== Query Methods ====================

  /**
   * Get asset by ID (excludes soft-deleted by default)
   */
  async getById(id: string, includeDeleted = false): Promise<Asset | null> {
    const query = db('assets').where({ id });

    if (!includeDeleted) {
      query.whereNull('deleted_at');
    }

    const asset = await query.first();
    return asset || null;
  }

  /**
   * Get asset by slug within a project
   */
  async getBySlug(slug: string, projectId: string): Promise<Asset | null> {
    const asset = await db('assets')
      .where({ slug, project_id: projectId })
      .whereNull('deleted_at')
      .first();
    return asset || null;
  }

  /**
   * List assets with filters
   */
  async list(filters: AssetFilter = {}): Promise<Asset[]> {
    const query = db('assets');

    if (!filters.includeDeleted) {
      query.whereNull('deleted_at');
    }

    if (filters.project_id) {
      query.where('project_id', filters.project_id);
    }

    if (filters.type) {
      query.where('type', filters.type);
    }

    if (filters.state) {
      query.where('state', filters.state);
    }

    if (filters.team_id) {
      query.where('team_id', filters.team_id);
    }

    if (filters.search) {
      query.where((builder) => {
        builder
          .where('name', 'ilike', `%${filters.search}%`)
          .orWhere('slug', 'ilike', `%${filters.search}%`)
          .orWhere('description', 'ilike', `%${filters.search}%`);
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      query.whereRaw('tags && ?', [filters.tags]);
    }

    query.orderBy('updated_at', 'desc');

    return await query;
  }

  /**
   * Check if asset exists (including soft-deleted)
   */
  async exists(id: string): Promise<boolean> {
    const count = await db('assets').where({ id }).count('id as count').first();
    return (count?.count as number) > 0;
  }

  /**
   * Check if slug is available in project
   */
  async isSlugAvailable(slug: string, projectId: string, excludeAssetId?: string): Promise<boolean> {
    const query = db('assets')
      .where({ slug, project_id: projectId })
      .whereNull('deleted_at');

    if (excludeAssetId) {
      query.whereNot('id', excludeAssetId);
    }

    const count = await query.count('id as count').first();
    return (count?.count as number) === 0;
  }

  // ==================== CRUD Operations ====================

  /**
   * Create a new asset
   */
  async create(input: CreateAssetInput): Promise<Asset> {
    // Check slug uniqueness
    const slugAvailable = await this.isSlugAvailable(input.slug, input.project_id);
    if (!slugAvailable) {
      throw new DuplicateSlugError(input.slug, input.project_id);
    }

    const now = new Date();

    const [asset] = await db('assets')
      .insert({
        name: input.name,
        slug: input.slug,
        description: input.description,
        tags: input.tags || [],
        type: input.type,
        state: 'draft',
        owners: input.owners || [],
        team_id: input.team_id,
        project_id: input.project_id,
        auto_approval_enabled: input.auto_approval_enabled ?? false,
        auto_approval_threshold: input.auto_approval_threshold,
        created_at: now,
        updated_at: now,
        created_by: input.created_by,
        updated_by: input.created_by,
      })
      .returning('*');

    // Create initial metadata if provided
    if (input.metadata && Object.keys(input.metadata).length > 0) {
      await db('asset_metadata').insert({
        asset_id: asset.id,
        metadata: input.metadata,
        created_at: now,
        updated_at: now,
      });
    }

    // Record state transition
    await this.recordStateTransition({
      asset_id: asset.id,
      from_state: 'draft',
      to_state: 'draft',
      triggered_by: 'system',
      actor_id: input.created_by,
      actor_type: 'user',
      reason: 'Asset created',
    });

    return asset;
  }

  /**
   * Update an asset
   */
  async update(id: string, input: UpdateAssetInput): Promise<Asset> {
    const asset = await this.getById(id);
    if (!asset) {
      throw new AssetNotFoundError(id);
    }

    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.owners !== undefined) updateData.owners = input.owners;
    if (input.auto_approval_enabled !== undefined) {
      updateData.auto_approval_enabled = input.auto_approval_enabled;
    }
    if (input.auto_approval_threshold !== undefined) {
      updateData.auto_approval_threshold = input.auto_approval_threshold;
    }
    if (input.updated_by !== undefined) updateData.updated_by = input.updated_by;

    const [updated] = await db('assets').where({ id }).update(updateData).returning('*');

    return updated;
  }

  // ==================== Soft Delete Operations (P0) ====================

  /**
   * Soft delete an asset
   * P0: Uses ON DELETE RESTRICT - application layer handles dependency checking
   */
  async softDelete(id: string, options: SoftDeleteOptions = {}): Promise<void> {
    const asset = await this.getById(id);
    if (!asset) {
      throw new AssetNotFoundError(id);
    }

    await withTransaction(async (trx) => {
      // Check for active dependencies
      const downstreamDeps = await this.countDownstreamDependencies(id, trx);

      if (downstreamDeps > 0 && !options.cascade) {
        throw new AssetHasDependenciesError(id, downstreamDeps);
      }

      // If cascade, mark downstream assets as dirty
      if (options.cascade && downstreamDeps > 0) {
        await this.markDownstreamDirty(id, trx);
      }

      // Perform soft delete
      await trx('assets')
        .where({ id })
        .update({
          deleted_at: new Date(),
          deleted_by: options.deleted_by,
          state: 'archived', // Archive state for deleted assets
          updated_at: new Date(),
        });

      // Record state transition
      await this.recordStateTransition(
        {
          asset_id: id,
          from_state: asset.state,
          to_state: 'archived',
          triggered_by: 'user',
          actor_id: options.deleted_by,
          actor_type: 'user',
          reason: options.cascade ? 'Soft deleted with cascade' : 'Soft deleted',
        },
        trx
      );

      // Clean up dirty_sources (handled by trigger, but we do it explicitly here too)
      await trx('dirty_sources').where({ asset_id: id }).delete();
    });
  }

  /**
   * Restore a soft-deleted asset
   */
  async restore(id: string, updatedBy?: string): Promise<Asset> {
    const asset = await db('assets').where({ id }).whereNotNull('deleted_at').first();

    if (!asset) {
      throw new AssetNotFoundError(id);
    }

    // Check if slug is still available
    const slugAvailable = await this.isSlugAvailable(asset.slug, asset.project_id, id);
    if (!slugAvailable) {
      throw new DuplicateSlugError(asset.slug, asset.project_id);
    }

    const [restored] = await db('assets')
      .where({ id })
      .update({
        deleted_at: null,
        deleted_by: null,
        state: 'draft', // Reset to draft after restore
        updated_at: new Date(),
        updated_by: updatedBy,
      })
      .returning('*');

    // Record state transition
    await this.recordStateTransition({
      asset_id: id,
      from_state: 'archived',
      to_state: 'draft',
      triggered_by: 'user',
      actor_id: updatedBy,
      actor_type: 'user',
      reason: 'Asset restored from soft delete',
    });

    return restored;
  }

  /**
   * Hard delete (permanent) - use with caution
   */
  async hardDelete(id: string): Promise<void> {
    const asset = await this.getById(id, true);
    if (!asset) {
      throw new AssetNotFoundError(id);
    }

    await withTransaction(async (trx) => {
      // Delete related records first (order matters for FK constraints)
      await trx('dirty_sources').where({ asset_id: id }).delete();
      await trx('asset_state_transitions').where({ asset_id: id }).delete();
      await trx('asset_metadata').where({ asset_id: id }).delete();

      // Delete versions (RESTRICT FK prevents if dependencies exist)
      const versions = await trx('asset_versions').where({ asset_id: id }).select('id');
      for (const version of versions) {
        await trx('dependencies')
          .where({ source_asset_id: version.id })
          .orWhere({ target_asset_id: version.id })
          .delete();
      }
      await trx('asset_versions').where({ asset_id: id }).delete();

      await trx('asset_paths').where({ asset_id: id }).delete();

      // Finally delete the asset
      await trx('assets').where({ id }).delete();
    });
  }

  /**
   * List soft-deleted assets
   */
  async listDeleted(projectId?: string): Promise<Asset[]> {
    const query = db('assets').whereNotNull('deleted_at');

    if (projectId) {
      query.where('project_id', projectId);
    }

    query.orderBy('deleted_at', 'desc');

    return await query;
  }

  // ==================== State Management ====================

  /**
   * Transition asset state
   */
  async transitionState(
    id: string,
    toState: AssetState,
    options: {
      triggeredBy: string;
      actorId?: string;
      actorType?: 'user' | 'agent';
      reason?: string;
      upstreamAssetId?: string;
      upstreamVersion?: string;
    }
  ): Promise<Asset> {
    const asset = await this.getById(id);
    if (!asset) {
      throw new AssetNotFoundError(id);
    }

    const fromState = asset.state;

    // Validate state transition
    if (!this.isValidStateTransition(fromState, toState)) {
      throw new InvalidStateTransitionError(fromState, toState);
    }

    const [updated] = await db('assets')
      .where({ id })
      .update({
        state: toState,
        updated_at: new Date(),
      })
      .returning('*');

    // Record transition
    await this.recordStateTransition({
      asset_id: id,
      from_state: fromState,
      to_state: toState,
      triggered_by: options.triggeredBy,
      actor_id: options.actorId,
      actor_type: options.actorType,
      reason: options.reason,
      upstream_asset_id: options.upstreamAssetId,
      upstream_version: options.upstreamVersion,
    });

    return updated;
  }

  /**
   * Mark asset as dirty (when upstream changes)
   */
  async markDirty(
    id: string,
    upstreamAssetId: string,
    upstreamVersion: string,
    options?: {
      impactLevel?: 'high' | 'medium' | 'low' | 'none';
      impactAnalysis?: Record<string, any>;
    }
  ): Promise<void> {
    const asset = await this.getById(id);
    if (!asset || asset.deleted_at) {
      return; // Skip if asset doesn't exist or is deleted
    }

    const previousState = asset.state;

    await withTransaction(async (trx) => {
      // Add to dirty sources
      await trx('dirty_sources')
        .insert({
          asset_id: id,
          upstream_asset_id: upstreamAssetId,
          upstream_version: upstreamVersion,
          impact_level: options?.impactLevel,
          impact_analysis: options?.impactAnalysis,
          status: 'pending',
          created_at: new Date(),
        })
        .onConflict(['asset_id', 'upstream_asset_id', 'upstream_version'])
        .ignore();

      // Transition state to dirty if currently clean
      if (asset.state === 'clean') {
        await trx('assets').where({ id }).update({
          state: 'dirty',
          updated_at: new Date(),
        });

        await this.recordStateTransition(
          {
            asset_id: id,
            from_state: 'clean',
            to_state: 'dirty',
            triggered_by: 'system',
            reason: `Upstream asset ${upstreamAssetId} published new version ${upstreamVersion}`,
            upstream_asset_id: upstreamAssetId,
            upstream_version: upstreamVersion,
          },
          trx
        );
      }
    });

    // Trigger webhook after transaction (non-blocking)
    try {
      await webhookService.triggerEvent(
        'asset.dirty',
        {
          asset_id: id,
          project_id: asset.project_id,
          upstream_asset_id: upstreamAssetId,
          upstream_version: upstreamVersion,
          impact_level: options?.impactLevel,
          impact_analysis: options?.impactAnalysis,
          previous_state: previousState,
          timestamp: new Date().toISOString(),
        },
        { projectId: asset.project_id }
      );
    } catch (error) {
      // TODO: Replace with proper logger when available
      // Silently fail - webhook errors should not affect asset operations
      // eslint-disable-next-line no-console
      logger.error('[AssetService] Failed to trigger dirty webhook:', error);
    }
  }

  /**
   * Acknowledge dirty status
   */
  async acknowledgeDirty(id: string, upstreamAssetId: string): Promise<void> {
    await db('dirty_sources')
      .where({
        asset_id: id,
        upstream_asset_id: upstreamAssetId,
      })
      .update({
        status: 'acknowledged',
      });
  }

  /**
   * Resolve dirty status
   */
  async resolveDirty(
    id: string,
    upstreamAssetId?: string,
    version?: string
  ): Promise<void> {
    const query = db('dirty_sources').where({ asset_id: id });

    if (upstreamAssetId) {
      query.where('upstream_asset_id', upstreamAssetId);
    }

    await query.update({
      status: 'resolved',
      resolved_at: new Date(),
    });

    // Check if all dirty sources are resolved
    const pendingCount = await db('dirty_sources')
      .where({ asset_id: id })
      .whereIn('status', ['pending', 'acknowledged', 'processing'])
      .count('id as count')
      .first();

    if ((pendingCount?.count as number) === 0) {
      const asset = await this.getById(id);
      if (asset && asset.state === 'dirty') {
        await this.transitionState(id, 'clean', {
          triggeredBy: 'system',
          reason: 'All upstream changes resolved',
        });
      }
    }
  }

  // ==================== Version Management ====================

  /**
   * Create a new version
   */
  async createVersion(input: CreateVersionInput): Promise<AssetVersion> {
    const asset = await this.getById(input.asset_id);
    if (!asset) {
      throw new AssetNotFoundError(input.asset_id);
    }

    const [version] = await db('asset_versions')
      .insert({
        asset_id: input.asset_id,
        version: input.version,
        content_ref: input.content_ref,
        content_hash: input.content_hash,
        content_size: input.content_size,
        changelog: input.changelog,
        changelog_summary: input.changelog_summary,
        state: 'draft',
        created_at: new Date(),
        created_by: input.created_by,
      })
      .returning('*');

    // Update asset's current version
    await db('assets')
      .where({ id: input.asset_id })
      .update({
        current_version: input.version,
        updated_at: new Date(),
      });

    return version;
  }

  /**
   * Publish a version
   */
  async publishVersion(
    assetId: string,
    version: string,
    publishedBy?: string
  ): Promise<AssetVersion> {
    const asset = await this.getById(assetId);
    if (!asset) {
      throw new AssetNotFoundError(assetId);
    }

    const [updated] = await db('asset_versions')
      .where({ asset_id: assetId, version })
      .update({
        state: 'published',
        published_at: new Date(),
        published_by: publishedBy,
      })
      .returning('*');

    if (!updated) {
      throw new AssetError(`Version ${version} not found for asset ${assetId}`, 'VERSION_NOT_FOUND');
    }

    // Mark downstream assets as dirty
    await this.propagateDirtyStatus(assetId, version);

    // Trigger webhook after publishing (non-blocking)
    try {
      await webhookService.triggerEvent(
        'asset.published',
        {
          asset_id: assetId,
          project_id: asset.project_id,
          version: version,
          published_by: publishedBy,
          timestamp: new Date().toISOString(),
        },
        { projectId: asset.project_id }
      );
    } catch (error) {
      logger.error('[AssetService] Failed to trigger published webhook:', error);
    }

    return updated;
  }

  /**
   * Get versions for an asset
   */
  async getVersions(assetId: string): Promise<AssetVersion[]> {
    return await db('asset_versions')
      .where({ asset_id: assetId })
      .orderBy('created_at', 'desc');
  }

  // ==================== Dependency Management ====================

  /**
   * Create a dependency
   */
  async createDependency(input: CreateDependencyInput): Promise<Dependency> {
    const [dependency] = await db('dependencies')
      .insert({
        source_asset_id: input.source_asset_id,
        source_version: input.source_version,
        target_asset_id: input.target_asset_id,
        target_version: input.target_version,
        confirmed_at: input.confirmed_by ? new Date() : undefined,
        confirmed_by: input.confirmed_by,
        auto_confirmed: input.auto_confirmed ?? false,
        created_at: new Date(),
      })
      .returning('*');

    return dependency;
  }

  /**
   * Get upstream dependencies
   */
  async getUpstreamDependencies(assetId: string, version?: string): Promise<Dependency[]> {
    const query = db('dependencies').where({ source_asset_id: assetId });
    if (version) {
      query.where('source_version', version);
    }
    return await query;
  }

  /**
   * Get downstream dependencies
   */
  async getDownstreamDependencies(assetId: string, version?: string): Promise<Dependency[]> {
    const query = db('dependencies').where({ target_asset_id: assetId });
    if (version) {
      query.where('target_version', version);
    }
    return await query;
  }

  /**
   * Remove a dependency
   */
  async removeDependency(
    sourceAssetId: string,
    sourceVersion: string,
    targetAssetId: string,
    targetVersion: string
  ): Promise<void> {
    await db('dependencies')
      .where({
        source_asset_id: sourceAssetId,
        source_version: sourceVersion,
        target_asset_id: targetAssetId,
        target_version: targetVersion,
      })
      .delete();
  }

  // ==================== Graph Queries (using ltree) ====================

  /**
   * Get all ancestors using ltree
   */
  async getAncestors(assetId: string): Promise<Asset[]> {
    return await db('assets')
      .join('asset_paths', 'assets.id', 'asset_paths.asset_id')
      .where(
        'asset_paths.path',
        '@>',
        db('asset_paths').where('asset_id', assetId).select('path')
      )
      .whereNot('assets.id', assetId)
      .whereNull('assets.deleted_at')
      .select('assets.*');
  }

  /**
   * Get all descendants using ltree
   */
  async getDescendants(assetId: string): Promise<Asset[]> {
    return await db('assets')
      .join('asset_paths', 'assets.id', 'asset_paths.asset_id')
      .where(
        'asset_paths.path',
        '<@',
        db('asset_paths').where('asset_id', assetId).select('path')
      )
      .whereNot('assets.id', assetId)
      .whereNull('assets.deleted_at')
      .select('assets.*');
  }

  // ==================== Private Helpers ====================

  private async countDownstreamDependencies(assetId: string, trx?: any): Promise<number> {
    const dbInstance = trx || db;

    // Count dependencies where this asset is the target (upstream for others)
    const result = await dbInstance('dependencies')
      .where({ target_asset_id: assetId })
      .count('id as count')
      .first();

    return parseInt(result?.count as string, 10) || 0;
  }

  private async markDownstreamDirty(assetId: string, trx?: any): Promise<void> {
    const dbInstance = trx || db;

    // Get all downstream assets
    const downstream = await dbInstance('dependencies')
      .where({ target_asset_id: assetId })
      .select('source_asset_id');

    const now = new Date();

    for (const dep of downstream) {
      // Add to dirty sources
      await dbInstance('dirty_sources')
        .insert({
          asset_id: dep.source_asset_id,
          upstream_asset_id: assetId,
          upstream_version: 'deleted',
          status: 'pending',
          created_at: now,
        })
        .onConflict(['asset_id', 'upstream_asset_id', 'upstream_version'])
        .ignore();

      // Mark as dirty
      await dbInstance('assets').where({ id: dep.source_asset_id }).update({
        state: 'dirty',
        updated_at: now,
      });
    }
  }

  private async propagateDirtyStatus(assetId: string, version: string): Promise<void> {
    const downstream = await db('dependencies')
      .where({ target_asset_id: assetId, target_version: version })
      .select('source_asset_id');

    const affectedAssetIds: string[] = [];

    for (const dep of downstream) {
      await this.markDirty(dep.source_asset_id, assetId, version);
      affectedAssetIds.push(dep.source_asset_id);
    }

    // Trigger batch webhook if there are affected assets
    if (affectedAssetIds.length > 0) {
      try {
        const upstreamAsset = await this.getById(assetId);
        await webhookService.triggerEvent(
          'asset.dirty_batch',
          {
            upstream_asset_id: assetId,
            upstream_version: version,
            affected_assets: affectedAssetIds,
            affected_count: affectedAssetIds.length,
            project_id: upstreamAsset?.project_id,
            timestamp: new Date().toISOString(),
          },
          { projectId: upstreamAsset?.project_id }
        );
      } catch (error) {
        logger.error('[AssetService] Failed to trigger dirty_batch webhook:', error);
      }
    }
  }

  private async recordStateTransition(
    data: {
      asset_id: string;
      from_state: AssetState;
      to_state: AssetState;
      triggered_by: string;
      actor_id?: string;
      actor_type?: 'user' | 'agent';
      reason?: string;
      upstream_asset_id?: string;
      upstream_version?: string;
    },
    trx?: any
  ): Promise<void> {
    const dbInstance = trx || db;

    await dbInstance('asset_state_transitions').insert({
      ...data,
      transitioned_at: new Date(),
    });
  }

  private isValidStateTransition(from: AssetState, to: AssetState): boolean {
    // Define valid transitions
    const transitions: Record<AssetState, AssetState[]> = {
      draft: ['clean', 'archived'],
      clean: ['dirty', 'modified', 'archived'],
      dirty: ['modified', 'clean', 'archived'],
      modified: ['clean', 'dirty', 'archived'],
      archived: [], // Terminal state
    };

    return transitions[from]?.includes(to) || false;
  }
}

// Export singleton instance
export const assetService = new AssetService();
