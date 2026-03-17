/**
 * Asset Fixtures - Test data factories
 */

import type {
  Asset,
  AssetVersion,
  Dependency,
  CreateAssetInput,
  CreateVersionInput,
  CreateDependencyInput,
} from '../../src/types/asset';
import type { Knex } from 'knex';

// Test IDs
export const TEST_IDS = {
  project: '11111111-1111-1111-1111-111111111111',
  team: '22222222-2222-2222-2222-222222222222',
  user: '33333333-3333-3333-3333-333333333333',
};

/**
 * Create a test asset input
 */
export function createAssetInput(overrides: Partial<CreateAssetInput> = {}): CreateAssetInput {
  const timestamp = Date.now();
  return {
    name: `Test Asset ${timestamp}`,
    slug: `test-asset-${timestamp}`,
    description: 'Test description',
    tags: ['test', 'fixture'],
    type: 'requirement',
    project_id: TEST_IDS.project,
    team_id: TEST_IDS.team,
    owners: [TEST_IDS.user],
    auto_approval_enabled: false,
    created_by: TEST_IDS.user,
    ...overrides,
  };
}

/**
 * Create a test asset in database
 */
export async function createTestAsset(
  trx: Knex.Transaction,
  overrides: Partial<CreateAssetInput> = {}
): Promise<Asset> {
  const input = createAssetInput(overrides);
  const now = new Date();

  const [asset] = await trx('assets')
    .insert({
      ...input,
      state: 'draft',
      current_version: null,
      deleted_at: null,
      deleted_by: null,
      created_at: now,
      updated_at: now,
    })
    .returning('*');

  return asset as Asset;
}

/**
 * Create multiple test assets
 */
export async function createTestAssets(
  trx: Knex.Transaction,
  count: number,
  overrides: Partial<CreateAssetInput> = {}
): Promise<Asset[]> {
  const assets: Asset[] = [];
  for (let i = 0; i < count; i++) {
    const asset = await createTestAsset(trx, {
      ...overrides,
      slug: `test-asset-${Date.now()}-${i}`,
    });
    assets.push(asset);
  }
  return assets;
}

/**
 * Create a test version input
 */
export function createVersionInput(
  assetId: string,
  overrides: Partial<CreateVersionInput> = {}
): CreateVersionInput {
  const version = `v${Date.now()}`;
  return {
    asset_id: assetId,
    version: version,
    content_ref: `git:commit:${Date.now()}`,
    content_hash: 'abc123',
    content_size: 1024,
    changelog: 'Initial version',
    changelog_summary: 'Initial',
    created_by: TEST_IDS.user,
    ...overrides,
  };
}

/**
 * Create a test version in database
 */
export async function createTestVersion(
  trx: Knex.Transaction,
  assetId: string,
  overrides: Partial<CreateVersionInput> = {}
): Promise<AssetVersion> {
  const input = createVersionInput(assetId, overrides);

  const [version] = await trx('asset_versions')
    .insert({
      ...input,
      state: 'draft',
      created_at: new Date(),
    })
    .returning('*');

  return version as AssetVersion;
}

/**
 * Create a published version
 */
export async function createPublishedVersion(
  trx: Knex.Transaction,
  assetId: string,
  overrides: Partial<CreateVersionInput> = {}
): Promise<AssetVersion> {
  const version = await createTestVersion(trx, assetId, overrides);

  const [published] = await trx('asset_versions')
    .where({ id: version.id })
    .update({
      state: 'published',
      published_at: new Date(),
      published_by: TEST_IDS.user,
    })
    .returning('*');

  return published as AssetVersion;
}

/**
 * Create a test dependency input
 */
export function createDependencyInput(
  sourceAssetId: string,
  targetAssetId: string,
  overrides: Partial<CreateDependencyInput> = {}
): CreateDependencyInput {
  return {
    source_asset_id: sourceAssetId,
    source_version: 'v1.0.0',
    target_asset_id: targetAssetId,
    target_version: 'v1.0.0',
    auto_confirmed: true,
    ...overrides,
  };
}

/**
 * Create a test dependency in database
 */
export async function createTestDependency(
  trx: Knex.Transaction,
  sourceAssetId: string,
  targetAssetId: string,
  overrides: Partial<CreateDependencyInput> = {}
): Promise<Dependency> {
  const input = createDependencyInput(sourceAssetId, targetAssetId, overrides);

  const [dependency] = await trx('dependencies')
    .insert({
      ...input,
      confirmed_at: new Date(),
      confirmed_by: TEST_IDS.user,
      created_at: new Date(),
      created_by: TEST_IDS.user,
    })
    .returning('*');

  return dependency as Dependency;
}

/**
 * Create asset with path (ltree)
 */
export async function createTestAssetWithPath(
  trx: Knex.Transaction,
  path: string,
  rootId: string,
  overrides: Partial<CreateAssetInput> = {}
): Promise<Asset> {
  const asset = await createTestAsset(trx, overrides);

  await trx('asset_paths').insert({
    asset_id: asset.id,
    path: path,
    root_id: rootId,
    depth: path.split('.').length - 1,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return asset;
}
