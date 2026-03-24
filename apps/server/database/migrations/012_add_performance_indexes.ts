import { Knex } from 'knex';

/**
 * Performance Optimization Migration
 * Adds indexes for frequently queried columns to improve query performance
 */

export async function up(knex: Knex): Promise<void> {
  // 1. Assets table - additional indexes for common filter patterns
  await knex.schema.alterTable('assets', (table) => {
    // Composite index for project_id + state queries (common in list filters)
    table.index(['project_id', 'state'], 'idx_assets_project_state');
    // Composite index for project_id + type queries
    table.index(['project_id', 'type'], 'idx_assets_project_type');
    // GIN index for owners array (membership queries)
    table.index('owners', 'idx_assets_owners_gin', 'gin');
    // GIN index for tags array
    table.index('tags', 'idx_assets_tags_gin', 'gin');
    // Index for created_by (audit queries)
    table.index('created_by');
  });

  // 2. Agent tables - slug lookups are frequent
  await knex.schema.alterTable('agents', (table) => {
    // Unique constraint already provides index, but ensure it's there
    table.index('slug', 'idx_agents_slug');
    table.index('mode');
    table.index('trigger_mode');
  });

  // 3. Agent sessions - session_id lookups
  await knex.schema.alterTable('agent_sessions', (table) => {
    table.index('session_id', 'idx_sessions_session_id');
    table.index('agent_id');
    table.index('user_id');
    table.index('status');
    table.index(['agent_id', 'status'], 'idx_sessions_agent_status');
    table.index(['created_at'], 'idx_sessions_created', { order: 'desc' });
  });

  // 4. Agent executions - execution_id and status queries
  await knex.schema.alterTable('agent_executions', (table) => {
    table.index('execution_id', 'idx_executions_execution_id');
    table.index('session_id');
    table.index('agent_id');
    table.index('status');
    table.index(['agent_id', 'status'], 'idx_executions_agent_status');
    table.index(['status', 'created_at'], 'idx_executions_status_created', { order: ['asc', 'desc'] });
    table.index(['created_at'], 'idx_executions_created', { order: 'desc' });
  });

  // 5. Skills - name lookups
  await knex.schema.alterTable('skills', (table) => {
    table.index('name', 'idx_skills_name');
  });

  // 6. Agent skills - agent_id lookups
  await knex.schema.alterTable('agent_skills', (table) => {
    table.index('agent_id');
    table.index('skill_id');
    table.index(['agent_id', 'skill_id'], 'idx_agent_skills_composite');
  });

  // 7. Dirty sources - asset_id + status is frequently queried
  await knex.schema.alterTable('dirty_sources', (table) => {
    // Replace simple index with composite index
    table.dropIndex(['asset_id', 'status'], 'idx_dirty_sources_asset');
    table.index(['asset_id', 'status', 'created_at'], 'idx_dirty_sources_asset_status_created', { order: ['asc', 'asc', 'desc'] });
    // Index for upstream queries
    table.index(['upstream_asset_id', 'upstream_version'], 'idx_dirty_sources_upstream');
  });

  // 8. Asset versions - frequently queried by asset_id and state
  await knex.schema.alterTable('asset_versions', (table) => {
    table.index(['asset_id', 'state'], 'idx_versions_asset_state');
    table.index('published_by');
  });

  // 9. Asset metadata - asset_id lookups
  await knex.schema.alterTable('asset_metadata', (table) => {
    table.index('asset_id');
    table.index(['asset_id', 'version'], 'idx_metadata_asset_version');
    // Index for priority/status filters
    table.index('priority');
    table.index('status');
  });

  // 10. Dependencies - source/target lookups
  await knex.schema.alterTable('dependencies', (table) => {
    table.index(['source_asset_id', 'source_version'], 'idx_deps_source');
    table.index(['target_asset_id', 'target_version'], 'idx_deps_target');
  });

  // 11. Webhook tables
  await knex.schema.alterTable('webhook_subscriptions', (table) => {
    table.index('project_id');
    table.index('event_type');
    table.index(['project_id', 'event_type'], 'idx_webhooks_project_event');
    table.index('status');
    table.index(['status', 'created_at'], 'idx_webhooks_status_created', { order: ['asc', 'desc'] });
  });

  await knex.schema.alterTable('webhook_deliveries', (table) => {
    table.index('subscription_id');
    table.index('status');
    table.index(['subscription_id', 'status'], 'idx_deliveries_subscription_status');
    table.index(['created_at'], 'idx_deliveries_created', { order: 'desc' });
  });

  // 12. Organization tables
  await knex.schema.alterTable('organizations', (table) => {
    table.index('slug', 'idx_orgs_slug');
    table.index(['parent_id', 'path'], 'idx_orgs_parent_path');
    table.index('path', 'idx_orgs_path', 'gist');
  });

  await knex.schema.alterTable('users', (table) => {
    table.index('email', 'idx_users_email');
    table.index('organization_id');
  });

  await knex.schema.alterTable('projects', (table) => {
    table.index('slug', 'idx_projects_slug');
    table.index('organization_id');
    table.index(['organization_id', 'slug'], 'idx_projects_org_slug');
  });

  await knex.schema.alterTable('project_members', (table) => {
    table.index('project_id');
    table.index('user_id');
    table.index('role_id');
    table.index(['project_id', 'user_id'], 'idx_project_members_composite');
  });

  // 13. Memory tables
  await knex.schema.alterTable('session_checkpoints', (table) => {
    table.index('session_id');
    table.index(['session_id', 'created_at'], 'idx_checkpoints_session_created', { order: ['asc', 'desc'] });
  });

  await knex.schema.alterTable('kv_memories', (table) => {
    table.index('namespace');
    table.index(['namespace', 'key'], 'idx_kv_namespace_key');
    table.index('expires_at');
    table.index(['namespace', 'level'], 'idx_kv_namespace_level');
  });

  await knex.schema.alterTable('project_memories', (table) => {
    table.index('project_id');
    table.index(['project_id', 'type'], 'idx_project_memories_project_type');
    table.index(['project_id', 'name'], 'idx_project_memories_project_name');
  });

  await knex.schema.alterTable('memory_candidates', (table) => {
    table.index('session_id');
    table.index('project_id');
    table.index('status');
    table.index(['project_id', 'status'], 'idx_candidates_project_status');
    table.index(['session_id', 'status'], 'idx_candidates_session_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove all indexes in reverse order

  // Memory tables
  await knex.schema.alterTable('memory_candidates', (table) => {
    table.dropIndex(['session_id', 'status'], 'idx_candidates_session_status');
    table.dropIndex(['project_id', 'status'], 'idx_candidates_project_status');
    table.dropIndex('status');
    table.dropIndex('project_id');
    table.dropIndex('session_id');
  });

  await knex.schema.alterTable('project_memories', (table) => {
    table.dropIndex(['project_id', 'name'], 'idx_project_memories_project_name');
    table.dropIndex(['project_id', 'type'], 'idx_project_memories_project_type');
    table.dropIndex('project_id');
  });

  await knex.schema.alterTable('kv_memories', (table) => {
    table.dropIndex(['namespace', 'level'], 'idx_kv_namespace_level');
    table.dropIndex('expires_at');
    table.dropIndex(['namespace', 'key'], 'idx_kv_namespace_key');
    table.dropIndex('namespace');
  });

  await knex.schema.alterTable('session_checkpoints', (table) => {
    table.dropIndex(['session_id', 'created_at'], 'idx_checkpoints_session_created');
    table.dropIndex('session_id');
  });

  // Organization tables
  await knex.schema.alterTable('project_members', (table) => {
    table.dropIndex(['project_id', 'user_id'], 'idx_project_members_composite');
    table.dropIndex('role_id');
    table.dropIndex('user_id');
    table.dropIndex('project_id');
  });

  await knex.schema.alterTable('projects', (table) => {
    table.dropIndex(['organization_id', 'slug'], 'idx_projects_org_slug');
    table.dropIndex('organization_id');
    table.dropIndex('slug', 'idx_projects_slug');
  });

  await knex.schema.alterTable('users', (table) => {
    table.dropIndex('organization_id');
    table.dropIndex('email', 'idx_users_email');
  });

  await knex.schema.alterTable('organizations', (table) => {
    table.dropIndex('path', 'idx_orgs_path');
    table.dropIndex(['parent_id', 'path'], 'idx_orgs_parent_path');
    table.dropIndex('slug', 'idx_orgs_slug');
  });

  // Webhook tables
  await knex.schema.alterTable('webhook_deliveries', (table) => {
    table.dropIndex(['created_at'], 'idx_deliveries_created');
    table.dropIndex(['subscription_id', 'status'], 'idx_deliveries_subscription_status');
    table.dropIndex('status');
    table.dropIndex('subscription_id');
  });

  await knex.schema.alterTable('webhook_subscriptions', (table) => {
    table.dropIndex(['status', 'created_at'], 'idx_webhooks_status_created');
    table.dropIndex('status');
    table.dropIndex(['project_id', 'event_type'], 'idx_webhooks_project_event');
    table.dropIndex('event_type');
    table.dropIndex('project_id');
  });

  // Dependencies
  await knex.schema.alterTable('dependencies', (table) => {
    table.dropIndex(['target_asset_id', 'target_version'], 'idx_deps_target');
    table.dropIndex(['source_asset_id', 'source_version'], 'idx_deps_source');
  });

  // Asset metadata
  await knex.schema.alterTable('asset_metadata', (table) => {
    table.dropIndex('status');
    table.dropIndex('priority');
    table.dropIndex(['asset_id', 'version'], 'idx_metadata_asset_version');
    table.dropIndex('asset_id');
  });

  // Asset versions
  await knex.schema.alterTable('asset_versions', (table) => {
    table.dropIndex('published_by');
    table.dropIndex(['asset_id', 'state'], 'idx_versions_asset_state');
  });

  // Dirty sources
  await knex.schema.alterTable('dirty_sources', (table) => {
    table.dropIndex(['upstream_asset_id', 'upstream_version'], 'idx_dirty_sources_upstream');
    table.dropIndex(['asset_id', 'status', 'created_at'], 'idx_dirty_sources_asset_status_created');
    // Restore original index
    table.index(['asset_id', 'status'], 'idx_dirty_sources_asset');
  });

  // Agent skills
  await knex.schema.alterTable('agent_skills', (table) => {
    table.dropIndex(['agent_id', 'skill_id'], 'idx_agent_skills_composite');
    table.dropIndex('skill_id');
    table.dropIndex('agent_id');
  });

  // Skills
  await knex.schema.alterTable('skills', (table) => {
    table.dropIndex('name', 'idx_skills_name');
  });

  // Agent executions
  await knex.schema.alterTable('agent_executions', (table) => {
    table.dropIndex(['created_at'], 'idx_executions_created');
    table.dropIndex(['status', 'created_at'], 'idx_executions_status_created');
    table.dropIndex(['agent_id', 'status'], 'idx_executions_agent_status');
    table.dropIndex('status');
    table.dropIndex('agent_id');
    table.dropIndex('session_id');
    table.dropIndex('execution_id', 'idx_executions_execution_id');
  });

  // Agent sessions
  await knex.schema.alterTable('agent_sessions', (table) => {
    table.dropIndex(['created_at'], 'idx_sessions_created');
    table.dropIndex(['agent_id', 'status'], 'idx_sessions_agent_status');
    table.dropIndex('status');
    table.dropIndex('user_id');
    table.dropIndex('agent_id');
    table.dropIndex('session_id', 'idx_sessions_session_id');
  });

  // Agents
  await knex.schema.alterTable('agents', (table) => {
    table.dropIndex('trigger_mode');
    table.dropIndex('mode');
    table.dropIndex('slug', 'idx_agents_slug');
  });

  // Assets
  await knex.schema.alterTable('assets', (table) => {
    table.dropIndex('created_by');
    table.dropIndex('tags', 'idx_assets_tags_gin');
    table.dropIndex('owners', 'idx_assets_owners_gin');
    table.dropIndex(['project_id', 'type'], 'idx_assets_project_type');
    table.dropIndex(['project_id', 'state'], 'idx_assets_project_state');
  });
}
