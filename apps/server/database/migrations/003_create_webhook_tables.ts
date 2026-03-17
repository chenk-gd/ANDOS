import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create webhook_subscriptions table
  await knex.schema.createTable('webhook_subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('url', 2048).notNullable();
    table.specificType('events', 'TEXT[]').notNullable();
    table.text('secret').notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.uuid('project_id').nullable();
    table.jsonb('metadata').nullable().defaultTo('{}');
    table.uuid('created_by').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_delivery').nullable();
    table.string('last_status', 20).nullable();
    table.integer('failure_count').notNullable().defaultTo(0);

    // Indexes
    table.index('project_id');
    table.index('active');
    table.index('created_by');
    table.index(['project_id', 'active']);
  });

  // Create webhook_deliveries table (partitioned by month for scalability)
  await knex.schema.createTable('webhook_deliveries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('subscription_id').notNullable();
    table.string('event_type', 255).notNullable();
    table.uuid('event_id').notNullable();
    table.jsonb('payload').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('attempts').notNullable().defaultTo(0);
    table.integer('response_status').nullable();
    table.text('response_body').nullable();
    table.text('error_message').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('delivered_at').nullable();
    table.timestamp('next_retry_at').nullable();

    // Indexes
    table.index('subscription_id');
    table.index('event_type');
    table.index('event_id');
    table.index('status');
    table.index('created_at');
    table.index('next_retry_at');
    table.index(['subscription_id', 'status', 'created_at']);
    table.index(['status', 'next_retry_at']); // For processing pending deliveries
  });

  // Add foreign key constraint
  await knex.raw(`
    ALTER TABLE webhook_deliveries
    ADD CONSTRAINT fk_webhook_deliveries_subscription
    FOREIGN KEY (subscription_id)
    REFERENCES webhook_subscriptions(id)
    ON DELETE CASCADE
  `);

  // Create platform_events table if not exists (for webhook event tracking)
  const hasPlatformEvents = await knex.schema.hasTable('platform_events');
  if (!hasPlatformEvents) {
    await knex.schema.createTable('platform_events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('event_type', 255).notNullable();
      table.string('resource_type', 100).notNullable();
      table.uuid('resource_id').notNullable();
      table.uuid('project_id').nullable();
      table.jsonb('payload').notNullable();
      table.uuid('triggered_by').nullable();
      table.string('triggered_by_type', 20).notNullable(); // 'user', 'agent', 'system'
      table.timestamp('published_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('processed_at').nullable();

      // Indexes
      table.index('event_type');
      table.index('resource_type');
      table.index('resource_id');
      table.index('project_id');
      table.index('published_at');
      table.index(['event_type', 'published_at']);
      table.index(['project_id', 'event_type']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order (respecting foreign keys)
  await knex.schema.dropTableIfExists('webhook_deliveries');
  await knex.schema.dropTableIfExists('webhook_subscriptions');
  // Note: platform_events might be used by other features, so we don't drop it here
}
