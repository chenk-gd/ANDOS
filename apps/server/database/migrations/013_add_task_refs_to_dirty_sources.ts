import { Knex } from 'knex';

/**
 * Migration: Add task references to dirty_sources
 * Phase 9.1: Workflow Orchestration Infrastructure
 */

export async function up(knex: Knex): Promise<void> {
  // Add task_ids array to track generated tasks for each dirty source
  await knex.schema.alterTable('dirty_sources', (table) => {
    // JSONB array to store associated task IDs
    table.jsonb('generated_tasks').defaultTo('[]');

    // Resolution strategy: auto (TaskGenerator handles) or manual (user handles)
    table.string('resolution_strategy', 20).defaultTo('auto');

    // Impact report reference for tracking
    table.uuid('impact_report_id');

    // Index for querying by impact report
    table.index('impact_report_id');
  });

  // Add check constraint for resolution_strategy
  await knex.raw(`
    ALTER TABLE dirty_sources
    ADD CONSTRAINT chk_resolution_strategy
    CHECK (resolution_strategy IN ('auto', 'manual'))
  `);

  // Add index for tasks that need resolution
  await knex.raw(`
    CREATE INDEX idx_dirty_sources_needs_resolution
    ON dirty_sources (asset_id, status)
    WHERE resolution_strategy = 'auto' AND status IN ('pending', 'acknowledged')
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove partial index
  await knex.raw('DROP INDEX IF EXISTS idx_dirty_sources_needs_resolution');

  // Remove constraint
  await knex.raw('ALTER TABLE dirty_sources DROP CONSTRAINT IF EXISTS chk_resolution_strategy');

  // Remove columns
  await knex.schema.alterTable('dirty_sources', (table) => {
    table.dropColumn('generated_tasks');
    table.dropColumn('resolution_strategy');
    table.dropColumn('impact_report_id');
  });
}
