import { Knex } from 'knex';

/**
 * Migration: Create task_routing_history table
 * Phase 9.3: Task Router Agent - Routing history tracking
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('task_routing_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Task reference
    table.uuid('task_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');

    // Router information
    table.string('router_agent_id', 100).notNullable();
    table.string('strategy_used', 50).notNullable();

    // Recommendation details (stored as JSON)
    table.jsonb('recommendation').notNullable().defaultTo('{}');

    // User override
    table.boolean('user_overridden').notNullable().defaultTo(false);
    table.text('override_reason');

    // Final assignment
    table.string('final_agent_id', 100).notNullable();

    // Execution result (filled later)
    table.boolean('execution_success');
    table.integer('execution_duration_ms');

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes for common queries
  await knex.schema.raw(`
    CREATE INDEX idx_task_routing_history_task
    ON task_routing_history (task_id, created_at DESC)
  `);

  await knex.schema.raw(`
    CREATE INDEX idx_task_routing_history_strategy
    ON task_routing_history (strategy_used, created_at DESC)
  `);

  await knex.schema.raw(`
    CREATE INDEX idx_task_routing_history_agent
    ON task_routing_history (final_agent_id, created_at DESC)
  `);

  await knex.schema.raw(`
    CREATE INDEX idx_task_routing_history_overridden
    ON task_routing_history (user_overridden)
    WHERE user_overridden = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_routing_history');
}
