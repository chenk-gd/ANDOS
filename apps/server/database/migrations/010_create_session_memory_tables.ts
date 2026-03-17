import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. session_checkpoints - Store session checkpoints for recovery
  await knex.schema.createTable('session_checkpoints', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('session_id', 255).notNullable().index();
    table.integer('sequence').notNullable();
    table.jsonb('state').notNullable();
    table.string('trigger', 50).notNullable(); // 'auto', 'manual', or 'pre_tool_call'
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).nullable();

    // Additional indexes
    table.index(['session_id', 'sequence'], 'idx_session_checkpoints_session_seq');
    table.index('expires_at', 'idx_session_checkpoints_expires');
  });

  // Add check constraint for trigger values
  await knex.raw(`
    ALTER TABLE session_checkpoints
    ADD CONSTRAINT chk_session_checkpoints_trigger
    CHECK (trigger IN ('auto', 'manual', 'pre_tool_call'))
  `);

  // 2. kv_memories - Key-value storage for memory system
  await knex.schema.createTable('kv_memories', (table) => {
    table.string('key', 500).primary(); // format: "{level}:{namespace}:{id}"
    table.jsonb('value').notNullable();
    table.string('namespace', 255).notNullable().defaultTo('default');
    table.string('level', 50).notNullable(); // 'session', 'project', or 'organization'
    table.string('project_id', 255).nullable().index();
    table.string('session_id', 255).nullable().index();
    table.string('etag', 64).notNullable(); // for optimistic locking
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).nullable();

    // Additional indexes
    table.index(['namespace', 'level'], 'idx_kv_memories_ns_level');
    table.index('expires_at', 'idx_kv_memories_expires');
  });

  // Add check constraint for level values
  await knex.raw(`
    ALTER TABLE kv_memories
    ADD CONSTRAINT chk_kv_memories_level
    CHECK (level IN ('session', 'project', 'organization'))
  `);

  // 3. memory_candidates - Auto-extracted memory candidates
  await knex.schema.createTable('memory_candidates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('type', 50).notNullable(); // 'decision', 'pattern', 'error', 'insight'
    table.text('content').notNullable();
    table.float('confidence').notNullable(); // 0.0 to 1.0
    table.string('source', 500).notNullable(); // e.g., 'session_abc123'
    table.string('status', 50).notNullable().defaultTo('pending'); // 'pending', 'approved', 'rejected'
    table.text('user_feedback').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.string('project_id', 255).nullable().index();

    // Additional indexes
    table.index('type', 'idx_memory_candidates_type');
    table.index('status', 'idx_memory_candidates_status');
    table.index('confidence', 'idx_memory_candidates_confidence');
    table.index(['status', 'created_at'], 'idx_memory_candidates_status_created');
  });

  // Add check constraints
  await knex.raw(`
    ALTER TABLE memory_candidates
    ADD CONSTRAINT chk_memory_candidates_type
    CHECK (type IN ('decision', 'pattern', 'error', 'insight'))
  `);

  await knex.raw(`
    ALTER TABLE memory_candidates
    ADD CONSTRAINT chk_memory_candidates_status
    CHECK (status IN ('pending', 'approved', 'rejected'))
  `);

  await knex.raw(`
    ALTER TABLE memory_candidates
    ADD CONSTRAINT chk_memory_candidates_confidence
    CHECK (confidence >= 0.0 AND confidence <= 1.0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order (foreign key safety)
  await knex.schema.dropTableIfExists('memory_candidates');
  await knex.schema.dropTableIfExists('kv_memories');
  await knex.schema.dropTableIfExists('session_checkpoints');
}
