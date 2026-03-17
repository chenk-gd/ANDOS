import { Knex } from 'knex';

/**
 * Migration: Create Agent and Event tables with partitioning (P0)
 * - agent_executions: partitioned by started_at (monthly)
 * - platform_events: partitioned by published_at (monthly)
 */

export async function up(knex: Knex): Promise<void> {
  // ==========================================
  // 1. Agent Schema
  // ==========================================

  // Agents table (no partitioning needed - small reference table)
  await knex.schema.createTable('agents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug', 100).unique().notNullable();
    table.string('name', 255).notNullable();
    table.text('description');

    // Capabilities
    table.specificType('capabilities', 'varchar(100)[]').defaultTo('{}');
    table.string('trigger_mode', 50);
    table.specificType('subscribed_events', 'varchar(100)[]').defaultTo('{}');

    // Configuration
    table.jsonb('config').defaultTo('{}');
    table.jsonb('model_config');
    table.text('prompt_template');

    // Status
    table.string('status', 20).notNullable().defaultTo('enabled');

    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by');

    // Index
    table.index('slug');
    table.index('status');
    table.index('capabilities');
  });

  // Add check constraint for trigger_mode
  await knex.raw(`
    ALTER TABLE agents
    ADD CONSTRAINT chk_agent_trigger_mode
    CHECK (trigger_mode IN ('event', 'schedule', 'manual'))
  `);

  // Add check constraint for status
  await knex.raw(`
    ALTER TABLE agents
    ADD CONSTRAINT chk_agent_status
    CHECK (status IN ('enabled', 'disabled'))
  `);

  // ==========================================
  // 2. Agent Executions (Partitioned Table)
  // ==========================================

  // P0: Create partitioned table using raw SQL (Knex doesn't support PARTITION BY)
  await knex.raw(`
    CREATE TABLE agent_executions (
      id UUID NOT NULL,
      execution_id UUID UNIQUE NOT NULL,

      agent_slug VARCHAR(100) NOT NULL REFERENCES agents(slug),
      session_id UUID,
      parent_execution_id UUID,

      trigger_event_type VARCHAR(100),
      trigger_event_payload JSONB,
      source_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,

      context_snapshot JSONB,
      context_ref VARCHAR(500),
      context_size INTEGER,

      status VARCHAR(20) DEFAULT 'running',
      outputs JSONB,
      actions JSONB,
      confidence FLOAT,
      reasoning TEXT,

      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      duration_ms INTEGER,
      token_used INTEGER,

      error_code VARCHAR(50),
      error_message TEXT,
      stack_trace TEXT,

      PRIMARY KEY (id, started_at)
    ) PARTITION BY RANGE (started_at)
  `);

  // Add check constraint for status
  await knex.raw(`
    ALTER TABLE agent_executions
    ADD CONSTRAINT chk_execution_status
    CHECK (status IN ('running', 'success', 'failed', 'pending_approval', 'cancelled'))
  `);

  // P0: Pre-create initial partitions (monthly)
  const currentYear = 2026;
  const months = [
    ['01', '02'], ['02', '03'], ['03', '04'], ['04', '05'],
    ['05', '06'], ['06', '07'], ['07', '08'], ['08', '09'],
    ['09', '10'], ['10', '11'], ['11', '12'], ['12', '13'],
  ];

  for (const [startMonth, endMonth] of months) {
    const partitionName = `agent_execs_${currentYear}_${startMonth}`;
    await knex.raw(`
      CREATE TABLE ${partitionName} PARTITION OF agent_executions
      FOR VALUES FROM ('${currentYear}-${startMonth}-01') TO ('${currentYear}-${endMonth}-01')
    `);
  }

  // Create indexes on partitioned table
  await knex.raw(`
    CREATE INDEX idx_agent_execs_agent ON agent_executions(agent_slug);
    CREATE INDEX idx_agent_execs_status ON agent_executions(status);
    CREATE INDEX idx_agent_execs_source ON agent_executions(source_asset_id);
    CREATE INDEX idx_agent_execs_session ON agent_executions(session_id);
    CREATE INDEX idx_agent_execs_started ON agent_executions(started_at DESC);
  `);

  // ==========================================
  // 3. Agent Approvals
  // ==========================================

  await knex.schema.createTable('agent_approvals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('execution_id').notNullable();

    // Approval info
    table.integer('level').notNullable();
    table.uuid('approver_id');
    table.string('approver_type', 20);

    table.string('decision', 20).notNullable();
    table.text('feedback');
    table.jsonb('auto_checks');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('decided_at', { useTz: true });

    // Index
    table.index('execution_id');
    table.index('decision');
  });

  // Add check constraint
  await knex.raw(`
    ALTER TABLE agent_approvals
    ADD CONSTRAINT chk_approval_decision
    CHECK (decision IN ('approved', 'rejected', 'timeout'))
  `);

  await knex.raw(`
    ALTER TABLE agent_approvals
    ADD CONSTRAINT chk_approver_type
    CHECK (approver_type IN ('user', 'system'))
  `);

  // ==========================================
  // 4. Agent Sessions
  // ==========================================

  await knex.schema.createTable('agent_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('session_id').unique().notNullable();

    table.string('agent_slug', 100).notNullable().references('slug').inTable('agents');
    table.uuid('parent_session_id').references('session_id').inTable('agent_sessions');

    table.string('status', 20).notNullable().defaultTo('active');

    table.specificType('context_assets', 'uuid[]').defaultTo('{}');
    table.jsonb('skill_snapshot');

    table.integer('turn_count').notNullable().defaultTo(0);
    table.timestamp('started_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('last_active_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('completed_at', { useTz: true });

    table.string('transcript_path', 500);

    // Indexes
    table.index('session_id');
    table.index('agent_slug');
    table.index('status');
    table.index('parent_session_id');
  });

  // Add check constraint
  await knex.raw(`
    ALTER TABLE agent_sessions
    ADD CONSTRAINT chk_session_status
    CHECK (status IN ('active', 'paused', 'completed', 'expired'))
  `);

  // ==========================================
  // 5. Skills
  // ==========================================

  await knex.schema.createTable('skills', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).unique().notNullable();
    table.string('version', 50).notNullable();
    table.string('display_name', 255);
    table.text('description');

    table.string('source', 50).notNullable();
    table.string('source_path', 500);

    table.jsonb('manifest');
    table.specificType('requires_bins', 'varchar(100)[]').defaultTo('{}');
    table.specificType('requires_env', 'varchar(100)[]').defaultTo('{}');
    table.specificType('requires_config', 'varchar(100)[]').defaultTo('{}');

    table.jsonb('tool_definitions');

    table.string('status', 20).notNullable().defaultTo('active');
    table.text('ineligible_reason');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // Indexes
    table.index('name');
    table.index('source');
    table.index('status');
  });

  // Add check constraint
  await knex.raw(`
    ALTER TABLE skills
    ADD CONSTRAINT chk_skill_source
    CHECK (source IN ('bundled', 'managed', 'workspace', 'remote'))
  `);

  await knex.raw(`
    ALTER TABLE skills
    ADD CONSTRAINT chk_skill_status
    CHECK (status IN ('active', 'disabled', 'ineligible'))
  `);

  // ==========================================
  // 6. Agent-Skill Association
  // ==========================================

  await knex.schema.createTable('agent_skills', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('agent_slug', 100).notNullable().references('slug').inTable('agents');
    table.uuid('skill_id').notNullable().references('id').inTable('skills');

    table.jsonb('config_override');
    table.boolean('enabled').notNullable().defaultTo(true);

    table.unique(['agent_slug', 'skill_id']);
    table.index('agent_slug');
    table.index('skill_id');
  });

  // ==========================================
  // 7. Platform Events (Partitioned Table)
  // ==========================================

  await knex.raw(`
    CREATE TABLE platform_events (
      id UUID NOT NULL,
      event_id UUID UNIQUE NOT NULL,

      event_type VARCHAR(100) NOT NULL,
      aggregate_type VARCHAR(50),
      aggregate_id UUID,

      payload JSONB NOT NULL,
      payload_hash VARCHAR(64),

      published_at TIMESTAMPTZ NOT NULL,
      published_by VARCHAR(100),

      processed_by VARCHAR(100)[],
      processing_status VARCHAR(20) DEFAULT 'pending',

      retry_count INTEGER DEFAULT 0,
      next_retry_at TIMESTAMPTZ,
      error_message TEXT,

      PRIMARY KEY (id, published_at)
    ) PARTITION BY RANGE (published_at)
  `);

  // Add check constraint
  await knex.raw(`
    ALTER TABLE platform_events
    ADD CONSTRAINT chk_event_status
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
  `);

  // Pre-create partitions for platform_events
  for (const [startMonth, endMonth] of months) {
    const partitionName = `platform_events_${currentYear}_${startMonth}`;
    await knex.raw(`
      CREATE TABLE ${partitionName} PARTITION OF platform_events
      FOR VALUES FROM ('${currentYear}-${startMonth}-01') TO ('${currentYear}-${endMonth}-01')
    `);
  }

  // Create indexes on partitioned table
  await knex.raw(`
    CREATE INDEX idx_platform_events_type ON platform_events(event_type);
    CREATE INDEX idx_platform_events_aggregate ON platform_events(aggregate_type, aggregate_id);
    CREATE INDEX idx_platform_events_status ON platform_events(processing_status);
    CREATE INDEX idx_platform_events_published ON platform_events(published_at DESC);
  `);

  // ==========================================
  // 8. Notifications
  // ==========================================

  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.uuid('recipient_id').notNullable();
    table.string('recipient_type', 20).notNullable();

    table.string('notification_type', 50).notNullable();
    table.string('title', 255);
    table.text('content');

    table.uuid('related_asset_id').references('id').inTable('assets');
    table.uuid('related_event_id');
    table.string('action_url', 500);

    table.string('status', 20).notNullable().defaultTo('unread');

    table.specificType('channels', 'varchar(50)[]').defaultTo('{}');
    table.jsonb('delivery_status');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('read_at', { useTz: true });
    table.timestamp('expires_at', { useTz: true });

    // Indexes
    table.index(['recipient_id', 'status']);
    table.index('related_asset_id');
    table.index('status');
    table.index('created_at', 'idx_notifications_created', { order: 'desc' });
  });

  // Add check constraints
  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT chk_notification_recipient_type
    CHECK (recipient_type IN ('user', 'agent', 'team'))
  `);

  await knex.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT chk_notification_status
    CHECK (status IN ('unread', 'read', 'acknowledged'))
  `);

  // ==========================================
  // 9. Partition Management Function
  // ==========================================

  // Function to create next month's partitions automatically
  await knex.raw(`
    CREATE OR REPLACE FUNCTION create_next_month_partitions()
    RETURNS void AS $$
    DECLARE
      next_month_start DATE;
      next_month_end DATE;
      year_str TEXT;
      month_str TEXT;
      partition_name TEXT;
    BEGIN
      -- Calculate next month
      next_month_start := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
      next_month_end := next_month_start + INTERVAL '1 month';

      year_str := TO_CHAR(next_month_start, 'YYYY');
      month_str := TO_CHAR(next_month_start, 'MM');

      -- Create agent_executions partition
      partition_name := 'agent_execs_' || year_str || '_' || month_str;
      IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE tablename = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF agent_executions FOR VALUES FROM (%L) TO (%L)',
          partition_name,
          next_month_start,
          next_month_end
        );
      END IF;

      -- Create platform_events partition
      partition_name := 'platform_events_' || year_str || '_' || month_str;
      IF NOT EXISTS (
        SELECT 1 FROM pg_tables WHERE tablename = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF platform_events FOR VALUES FROM (%L) TO (%L)',
          partition_name,
          next_month_start,
          next_month_end
        );
      END IF;
    END;
    $$ LANGUAGE plpgsql
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order

  // Drop partition management function
  await knex.raw('DROP FUNCTION IF EXISTS create_next_month_partitions()');

  // Drop notification tables
  await knex.schema.dropTableIfExists('notifications');

  // Drop partitioned tables (cascade to partitions)
  await knex.raw('DROP TABLE IF EXISTS platform_events CASCADE');
  await knex.raw('DROP TABLE IF EXISTS agent_executions CASCADE');

  // Drop agent tables
  await knex.schema.dropTableIfExists('agent_skills');
  await knex.schema.dropTableIfExists('skills');
  await knex.schema.dropTableIfExists('agent_sessions');
  await knex.schema.dropTableIfExists('agent_approvals');
  await knex.schema.dropTableIfExists('agents');
}
