import { Knex } from 'knex';

/** Valid pattern types for learned_patterns table */
const LEARNED_PATTERN_TYPES = ['code', 'api', 'error', 'convention', 'decision'];

/** Valid file types for project_memory_files table */
const PROJECT_MEMORY_FILE_TYPES = ['PROJECT_MEMORY', 'SESSION_SUMMARY', 'STANDARDS'];

/**
 * Creates project memory tables:
 * - project_memories: Stores project-level static context
 * - learned_patterns: Stores patterns learned from user interactions
 * - project_memory_files: Tracks file transparency layer
 */
export async function up(knex: Knex): Promise<void> {
  // 1. project_memories - Project-level static context
  await knex.schema.createTable('project_memories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('project_id', 255).notNullable().unique();
    table.jsonb('shared_context').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.integer('version').notNullable().defaultTo(1);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Additional indexes
    table.index('project_id', 'idx_project_memories_project_id');
    table.index('updated_at', 'idx_project_memories_updated_at');
  });

  // 2. learned_patterns - Learned patterns (V1.5 without embedding)
  await knex.schema.createTable('learned_patterns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('project_id', 255).notNullable().index();
    table.string('type', 50).notNullable(); // See LEARNED_PATTERN_TYPES constant
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.jsonb('pattern').notNullable();
    table.integer('frequency').notNullable().defaultTo(1);
    table.float('confidence').notNullable();
    table.timestamp('last_observed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Additional indexes
    table.index(['project_id', 'type'], 'idx_learned_patterns_project_type');
    table.index('type', 'idx_learned_patterns_type');
    table.index('name', 'idx_learned_patterns_name');
    table.index('confidence', 'idx_learned_patterns_confidence');
    table.index('last_observed_at', 'idx_learned_patterns_last_observed');
  });

  // Add check constraint for type values
  await knex.raw(`
    ALTER TABLE learned_patterns
    ADD CONSTRAINT chk_learned_patterns_type
    CHECK (type IN (${LEARNED_PATTERN_TYPES.map(t => `'${t}'`).join(', ')}))
  `);

  // Add check constraint for confidence range
  await knex.raw(`
    ALTER TABLE learned_patterns
    ADD CONSTRAINT chk_learned_patterns_confidence
    CHECK (confidence >= 0.0 AND confidence <= 1.0)
  `);

  // 3. project_memory_files - File transparency layer tracking
  await knex.schema.createTable('project_memory_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('project_id', 255).notNullable().index();
    table.string('file_path', 500).notNullable();
    table.string('file_type', 50).notNullable(); // See PROJECT_MEMORY_FILE_TYPES constant
    table.string('content_hash', 64).notNullable();
    table.timestamp('last_synced_at', { useTz: true }).nullable();
    table.timestamp('last_modified_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Additional indexes
    table.index(['project_id', 'file_path'], 'idx_project_memory_files_project_path');
    table.index('file_type', 'idx_project_memory_files_type');
    table.index('last_synced_at', 'idx_project_memory_files_last_synced');
    table.index('last_modified_at', 'idx_project_memory_files_last_modified');
  });

  // Add check constraint for file_type values
  await knex.raw(`
    ALTER TABLE project_memory_files
    ADD CONSTRAINT chk_project_memory_files_type
    CHECK (file_type IN (${PROJECT_MEMORY_FILE_TYPES.map(t => `'${t}'`).join(', ')}))
  `);
}

/**
 * Rolls back the migration by dropping all project memory tables.
 * Tables are dropped in reverse order of creation for foreign key safety.
 */
export async function down(knex: Knex): Promise<void> {

  // Drop tables in reverse order (foreign key safety)
  await knex.schema.dropTableIfExists('project_memory_files');
  await knex.schema.dropTableIfExists('learned_patterns');
  await knex.schema.dropTableIfExists('project_memories');
}
