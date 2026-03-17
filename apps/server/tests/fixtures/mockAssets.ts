/**
 * Mock Fixtures - Test data factories for mock database
 */

import type {
  Asset,
  AssetVersion,
  Dependency,
  CreateAssetInput,
  CreateVersionInput,
  CreateDependencyInput,
} from '../../src/types/asset';
import { generateTestId, setMockTable, getMockTable } from '../helpers/mockDb';

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
 * Create a test asset in mock database
 */
export async function createTestAsset(
  trx: any,
  overrides: Partial<CreateAssetInput> = {}
): Promise<Asset> {
  const input = createAssetInput(overrides);
  const now = new Date();
  const id = generateTestId('asset');

  const asset: Asset = {
    id,
    ...input,
    state: 'draft',
    current_version: null,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
    updated_by: input.created_by,
  } as Asset;

  const table = getMockTable('assets');
  table.push(asset);
  setMockTable('assets', table);

  return asset;
}

/**
 * Create multiple test assets
 */
export async function createTestAssets(
  trx: any,
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
 * Create a test version in mock database
 */
export async function createTestVersion(
  trx: any,
  assetId: string,
  overrides: Partial<CreateVersionInput> = {}
): Promise<AssetVersion> {
  const input = createVersionInput(assetId, overrides);
  const id = generateTestId('version');

  const version: AssetVersion = {
    id,
    ...input,
    state: 'draft',
    published_at: null,
    published_by: null,
    created_at: new Date(),
  } as AssetVersion;

  const table = getMockTable('asset_versions');
  table.push(version);
  setMockTable('asset_versions', table);

  // Update asset's current_version
  const assets = getMockTable('assets');
  const asset = assets.find((a: Asset) => a.id === assetId);
  if (asset) {
    asset.current_version = input.version;
    setMockTable('assets', assets);
  }

  return version;
}

/**
 * Create a published version
 */
export async function createPublishedVersion(
  trx: any,
  assetId: string,
  overrides: Partial<CreateVersionInput> = {}
): Promise<AssetVersion> {
  const version = await createTestVersion(trx, assetId, overrides);

  const table = getMockTable('asset_versions');
  const idx = table.findIndex((v: AssetVersion) => v.id === version.id);
  if (idx >= 0) {
    table[idx].state = 'published';
    table[idx].published_at = new Date();
    table[idx].published_by = TEST_IDS.user;
    setMockTable('asset_versions', table);
  }

  return { ...version, state: 'published', published_at: new Date(), published_by: TEST_IDS.user };
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
 * Create a test dependency in mock database
 */
export async function createTestDependency(
  trx: any,
  sourceAssetId: string,
  targetAssetId: string,
  overrides: Partial<CreateDependencyInput> = {}
): Promise<Dependency> {
  const input = createDependencyInput(sourceAssetId, targetAssetId, overrides);
  const id = generateTestId('dep');

  const dependency: Dependency = {
    id,
    ...input,
    confirmed_at: new Date(),
    confirmed_by: TEST_IDS.user,
    created_at: new Date(),
    created_by: TEST_IDS.user,
  } as Dependency;

  const table = getMockTable('dependencies');
  table.push(dependency);
  setMockTable('dependencies', table);

  return dependency;
}

/**
 * Create asset with path (ltree)
 */
export async function createTestAssetWithPath(
  trx: any,
  path: string,
  rootId: string,
  overrides: Partial<CreateAssetInput> = {}
): Promise<Asset> {
  const asset = await createTestAsset(trx, overrides);

  const pathRecord = {
    asset_id: asset.id,
    path: path,
    root_id: rootId,
    depth: path.split('.').length - 1,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const table = getMockTable('asset_paths');
  table.push(pathRecord);
  setMockTable('asset_paths', table);

  return asset;
}
