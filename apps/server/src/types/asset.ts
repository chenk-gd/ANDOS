/**
 * Asset Types - AI-Native DevOps Platform
 * Based on database design v1.0
 */

export type AssetState = 'draft' | 'clean' | 'dirty' | 'modified' | 'archived';
export type AssetType = 'requirement' | 'design' | 'task' | 'code' | 'test' | 'pipeline';
export type VersionState = 'draft' | 'published' | 'deprecated';
export type DirtyStatus = 'pending' | 'acknowledged' | 'processing' | 'resolved';
export type ImpactLevel = 'high' | 'medium' | 'low' | 'none';

export interface Asset {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tags: string[];
  type: AssetType;

  // Current state
  current_version?: string;
  state: AssetState;

  // Ownership
  owners: string[];
  team_id?: string;
  project_id: string;

  // Auto approval
  auto_approval_enabled: boolean;
  auto_approval_threshold?: 'off' | 'high' | 'medium' | 'low';

  // Timestamps
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;

  // Soft delete
  deleted_at?: Date;
  deleted_by?: string;
}

export interface AssetVersion {
  id: string;
  asset_id: string;
  version: string;

  // Content reference
  content_ref: string;
  content_hash?: string;
  content_size?: number;

  // Changelog
  changelog: string;
  changelog_summary?: string;

  // Publish info
  state: VersionState;
  published_at?: Date;
  published_by?: string;

  // Creation
  created_at: Date;
  created_by?: string;
}

export interface AssetMetadata {
  id: string;
  asset_id: string;
  version?: string;
  metadata: Record<string, any>;

  // Typed fields
  priority?: string;
  status?: string;
  due_date?: Date;
  estimated_effort?: number;

  created_at: Date;
  updated_at: Date;
}

export interface Dependency {
  id: string;
  source_asset_id: string;
  source_version: string;
  target_asset_id: string;
  target_version: string;

  // Confirmation
  confirmed_at?: Date;
  confirmed_by?: string;
  auto_confirmed: boolean;

  // Creation
  created_at: Date;
  created_by?: string;
}

export interface AssetPath {
  asset_id: string;
  path: string;
  root_id: string;
  depth: number;
  created_at: Date;
  updated_at: Date;
}

export interface AssetStateTransition {
  id: string;
  asset_id: string;
  version?: string;
  from_state: AssetState;
  to_state: AssetState;

  // Trigger info
  triggered_by: string;
  actor_id?: string;
  actor_type?: 'user' | 'agent';

  // Context
  upstream_asset_id?: string;
  upstream_version?: string;

  reason?: string;
  metadata?: Record<string, any>;

  transitioned_at: Date;
}

export interface DirtySource {
  id: string;
  asset_id: string;
  upstream_asset_id: string;
  upstream_version: string;
  upstream_published_at?: Date;

  impact_level?: ImpactLevel;
  impact_analysis?: Record<string, any>;

  status: DirtyStatus;
  created_at: Date;
  resolved_at?: Date;
}

// Input types for creating/updating
export interface CreateAssetInput {
  name: string;
  slug: string;
  description?: string;
  tags?: string[];
  type: AssetType;
  project_id: string;
  team_id?: string;
  owners?: string[];
  auto_approval_enabled?: boolean;
  auto_approval_threshold?: 'off' | 'high' | 'medium' | 'low';
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateAssetInput {
  name?: string;
  description?: string;
  tags?: string[];
  owners?: string[];
  auto_approval_enabled?: boolean;
  auto_approval_threshold?: 'off' | 'high' | 'medium' | 'low';
  updated_by?: string;
}

export interface CreateVersionInput {
  asset_id: string;
  version: string;
  content_ref: string;
  content_hash?: string;
  content_size?: number;
  changelog: string;
  changelog_summary?: string;
  created_by?: string;
}

export interface CreateDependencyInput {
  source_asset_id: string;
  source_version: string;
  target_asset_id: string;
  target_version: string;
  confirmed_by?: string;
  auto_confirmed?: boolean;
}

// Query filters
export interface AssetFilter {
  project_id?: string;
  type?: AssetType;
  state?: AssetState;
  team_id?: string;
  search?: string;
  tags?: string[];
  includeDeleted?: boolean;
}

// Soft delete options
export interface SoftDeleteOptions {
  deleted_by?: string;
  cascade?: boolean; // Whether to soft delete dependent assets
}
