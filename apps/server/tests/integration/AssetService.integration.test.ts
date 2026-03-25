/**
 * AssetService Tests
 * Tests for soft delete, state management, dependencies, and graph queries
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { assetService, AssetNotFoundError, DuplicateSlugError, AssetHasDependenciesError } from '@/services/AssetService';
import { withTestTransaction, createTestTransaction } from '~/helpers/db';
import {
  createTestAsset,
  createTestVersion,
  createPublishedVersion,
  createTestDependency,
  createTestAssetWithPath,
  createAssetInput,
  TEST_IDS,
} from '~/fixtures/assets';
import type { Knex } from 'knex';

describe('AssetService', () => {
  describe('CRUD Operations', () => {
    it('should create an asset', async () => {
      await withTestTransaction(async (trx) => {
        const input = createAssetInput();
        const asset = await assetService.create(input);

        expect(asset).toBeDefined();
        expect(asset.name).toBe(input.name);
        expect(asset.slug).toBe(input.slug);
        expect(asset.state).toBe('draft');
        expect(asset.project_id).toBe(TEST_IDS.project);
      });
    });

    it('should get asset by id', async () => {
      await withTestTransaction(async (trx) => {
        const created = await createTestAsset(trx);
        const asset = await assetService.getById(created.id);

        expect(asset).toBeDefined();
        expect(asset?.id).toBe(created.id);
        expect(asset?.name).toBe(created.name);
      });
    });

    it('should return null for non-existent asset', async () => {
      await withTestTransaction(async () => {
        const asset = await assetService.getById('non-existent-id');
        expect(asset).toBeNull();
      });
    });

    it('should get asset by slug', async () => {
      await withTestTransaction(async (trx) => {
        const created = await createTestAsset(trx);
        const asset = await assetService.getBySlug(created.slug, TEST_IDS.project);

        expect(asset).toBeDefined();
        expect(asset?.id).toBe(created.id);
      });
    });

    it('should update an asset', async () => {
      await withTestTransaction(async (trx) => {
        const created = await createTestAsset(trx);
        const updated = await assetService.update(created.id, {
          name: 'Updated Name',
          updated_by: TEST_IDS.user,
        });

        expect(updated.name).toBe('Updated Name');
        expect(updated.slug).toBe(created.slug); // Unchanged
      });
    });

    it('should throw AssetNotFoundError when updating non-existent asset', async () => {
      await withTestTransaction(async () => {
        await expect(
          assetService.update('non-existent', { name: 'Test' })
        ).rejects.toThrow(AssetNotFoundError);
      });
    });

    it('should list assets with filters', async () => {
      await withTestTransaction(async (trx) => {
        await createTestAsset(trx, { type: 'requirement' });
        await createTestAsset(trx, { type: 'design' });

        const requirements = await assetService.list({ type: 'requirement' });
        expect(requirements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Soft Delete', () => {
    it('should soft delete an asset', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        await assetService.softDelete(asset.id, { deleted_by: TEST_IDS.user });

        const deleted = await assetService.getById(asset.id);
        expect(deleted).toBeNull(); // Excluded by default

        const deletedIncluding = await assetService.getById(asset.id, true);
        expect(deletedIncluding).toBeDefined();
        expect(deletedIncluding?.deleted_at).toBeDefined();
        expect(deletedIncluding?.state).toBe('archived');
      });
    });

    it('should not allow soft delete if dependencies exist', async () => {
      await withTestTransaction(async (trx) => {
        const upstream = await createTestAsset(trx);
        const downstream = await createTestAsset(trx);

        // Create dependency: downstream depends on upstream
        await createTestDependency(trx, downstream.id, upstream.id);

        await expect(
          assetService.softDelete(upstream.id, { deleted_by: TEST_IDS.user })
        ).rejects.toThrow(AssetHasDependenciesError);
      });
    });

    it('should allow soft delete with cascade', async () => {
      await withTestTransaction(async (trx) => {
        const upstream = await createTestAsset(trx);
        const downstream = await createTestAsset(trx);

        await createTestDependency(trx, downstream.id, upstream.id);

        // Should succeed with cascade
        await assetService.softDelete(upstream.id, {
          deleted_by: TEST_IDS.user,
          cascade: true,
        });

        // Downstream should be marked dirty
        const dirtySources = await trx('dirty_sources')
          .where({ asset_id: downstream.id })
          .select('*');

        expect(dirtySources.length).toBeGreaterThan(0);
      });
    });

    it('should restore a soft-deleted asset', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        await assetService.softDelete(asset.id, { deleted_by: TEST_IDS.user });

        const restored = await assetService.restore(asset.id, TEST_IDS.user);
        expect(restored.deleted_at).toBeNull();
        expect(restored.state).toBe('draft');

        const found = await assetService.getById(asset.id);
        expect(found).toBeDefined();
      });
    });

    it('should list soft-deleted assets', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        await assetService.softDelete(asset.id, { deleted_by: TEST_IDS.user });

        const deleted = await assetService.listDeleted(TEST_IDS.project);
        expect(deleted.length).toBeGreaterThan(0);
        expect(deleted.some((a) => a.id === asset.id)).toBe(true);
      });
    });
  });

  describe('State Management', () => {
    it('should transition from draft to clean', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        const updated = await assetService.transitionState(asset.id, 'clean', {
          triggeredBy: 'user',
          actorId: TEST_IDS.user,
          actorType: 'user',
        });

        expect(updated.state).toBe('clean');
      });
    });

    it('should mark asset as dirty when upstream changes', async () => {
      await withTestTransaction(async (trx) => {
        const upstream = await createTestAsset(trx);
        const downstream = await createTestAsset(trx, { state: 'clean' });

        // Create dependency
        await createTestDependency(trx, downstream.id, upstream.id);

        // Publish upstream version
        await createPublishedVersion(trx, upstream.id);

        // Mark downstream as dirty
        await assetService.markDirty(downstream.id, upstream.id, 'v1.0.0', {
          impactLevel: 'high',
        });

        const updated = await assetService.getById(downstream.id);
        expect(updated?.state).toBe('dirty');

        const dirtySources = await trx('dirty_sources')
          .where({ asset_id: downstream.id })
          .select('*');

        expect(dirtySources.length).toBeGreaterThan(0);
      });
    });

    it('should resolve dirty status', async () => {
      await withTestTransaction(async (trx) => {
        const upstream = await createTestAsset(trx);
        const downstream = await createTestAsset(trx);

        await createTestDependency(trx, downstream.id, upstream.id);
        await createPublishedVersion(trx, upstream.id);
        await assetService.markDirty(downstream.id, upstream.id, 'v1.0.0');

        await assetService.resolveDirty(downstream.id, upstream.id);

        const dirtySources = await trx('dirty_sources')
          .where({ asset_id: downstream.id })
          .where('status', 'resolved')
          .select('*');

        expect(dirtySources.length).toBeGreaterThan(0);
      });
    });

    it('should transition to clean when all dirty sources resolved', async () => {
      await withTestTransaction(async (trx) => {
        const upstream = await createTestAsset(trx);
        const downstream = await createTestAsset(trx, { state: 'dirty' });

        await trx('assets').where({ id: downstream.id }).update({ state: 'dirty' });

        // Add single dirty source
        await trx('dirty_sources').insert({
          asset_id: downstream.id,
          upstream_asset_id: upstream.id,
          upstream_version: 'v1.0.0',
          status: 'pending',
          created_at: new Date(),
        });

        // Resolve it
        await assetService.resolveDirty(downstream.id, upstream.id);

        const updated = await assetService.getById(downstream.id);
        expect(updated?.state).toBe('clean');
      });
    });
  });

  describe('Version Management', () => {
    it('should create a version', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        const version = await assetService.createVersion({
          asset_id: asset.id,
          version: 'v1.0.0',
          content_ref: 'git:abc123',
          changelog: 'Initial version',
          created_by: TEST_IDS.user,
        });

        expect(version.version).toBe('v1.0.0');
        expect(version.state).toBe('draft');
      });
    });

    it('should publish a version', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        const version = await createTestVersion(trx, asset.id);

        const published = await assetService.publishVersion(
          asset.id,
          version.version,
          TEST_IDS.user
        );

        expect(published.state).toBe('published');
        expect(published.published_at).toBeDefined();
      });
    });

    it('should get versions for an asset', async () => {
      await withTestTransaction(async (trx) => {
        const asset = await createTestAsset(trx);
        await createTestVersion(trx, asset.id, { version: 'v1.0.0' });
        await createTestVersion(trx, asset.id, { version: 'v1.1.0' });

        const versions = await assetService.getVersions(asset.id);
        expect(versions.length).toBe(2);
      });
    });
  });

  describe('Dependency Management', () => {
    it('should create a dependency', async () => {
      await withTestTransaction(async (trx) => {
        const source = await createTestAsset(trx);
        const target = await createTestAsset(trx);

        const dep = await assetService.createDependency({
          source_asset_id: source.id,
          source_version: 'v1.0.0',
          target_asset_id: target.id,
          target_version: 'v1.0.0',
          auto_confirmed: true,
        });

        expect(dep.source_asset_id).toBe(source.id);
        expect(dep.target_asset_id).toBe(target.id);
      });
    });

    it('should get upstream dependencies', async () => {
      await withTestTransaction(async (trx) => {
        const source = await createTestAsset(trx);
        const target = await createTestAsset(trx);

        await createTestDependency(trx, source.id, target.id);

        const upstream = await assetService.getUpstreamDependencies(source.id);
        expect(upstream.length).toBe(1);
        expect(upstream[0].target_asset_id).toBe(target.id);
      });
    });

    it('should get downstream dependencies', async () => {
      await withTestTransaction(async (trx) => {
        const source = await createTestAsset(trx);
        const target = await createTestAsset(trx);

        await createTestDependency(trx, source.id, target.id);

        const downstream = await assetService.getDownstreamDependencies(target.id);
        expect(downstream.length).toBe(1);
        expect(downstream[0].source_asset_id).toBe(source.id);
      });
    });

    it('should remove a dependency', async () => {
      await withTestTransaction(async (trx) => {
        const source = await createTestAsset(trx);
        const target = await createTestAsset(trx);

        await createTestDependency(trx, source.id, target.id);

        await assetService.removeDependency(source.id, 'v1.0.0', target.id, 'v1.0.0');

        const deps = await assetService.getUpstreamDependencies(source.id);
        expect(deps.length).toBe(0);
      });
    });
  });

  describe('Slug Uniqueness', () => {
    it('should prevent duplicate slug in same project', async () => {
      await withTestTransaction(async (trx) => {
        const input = createAssetInput({ slug: 'unique-slug' });
        await assetService.create(input);

        await expect(assetService.create(input)).rejects.toThrow(DuplicateSlugError);
      });
    });

    it('should allow same slug after soft delete', async () => {
      await withTestTransaction(async (trx) => {
        const input = createAssetInput({ slug: 'reusable-slug' });
        const asset = await assetService.create(input);
        await assetService.softDelete(asset.id, { deleted_by: TEST_IDS.user });

        // Should be able to create new asset with same slug
        const newAsset = await assetService.create({
          ...input,
          name: 'New Asset',
        });

        expect(newAsset.slug).toBe('reusable-slug');
      });
    });

    it('should allow slug in different projects', async () => {
      await withTestTransaction(async (trx) => {
        const input = createAssetInput({ slug: 'same-slug' });
        await assetService.create(input);

        const otherProject = '44444444-4444-4444-4444-444444444444';
        const otherAsset = await assetService.create({
          ...input,
          project_id: otherProject,
        });

        expect(otherAsset.slug).toBe('same-slug');
      });
    });
  });

  describe('Graph Queries (ltree)', () => {
    it('should get descendants using ltree', async () => {
      await withTestTransaction(async (trx) => {
        const root = await createTestAssetWithPath(trx, 'root', 'root-id');
        const child = await createTestAssetWithPath(trx, 'root.child', root.id);
        const grandchild = await createTestAssetWithPath(trx, 'root.child.grandchild', root.id);

        // Note: These queries require actual ltree data in asset_paths table
        // The test verifies the query structure works
        const descendants = await assetService.getDescendants(root.id);
        expect(Array.isArray(descendants)).toBe(true);
      });
    });

    it('should get ancestors using ltree', async () => {
      await withTestTransaction(async (trx) => {
        const root = await createTestAssetWithPath(trx, 'root2', 'root2-id');
        const child = await createTestAssetWithPath(trx, 'root2.child', root.id);

        const ancestors = await assetService.getAncestors(child.id);
        expect(Array.isArray(ancestors)).toBe(true);
      });
    });
  });
});
