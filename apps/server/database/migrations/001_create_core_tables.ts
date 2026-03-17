import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 启用 UUID 和 ltree 扩展
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "ltree"');

  // 1. 资产主表（含软删除）
  await knex.schema.createTable('assets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 255).notNullable();
    table.string('slug', 255).notNullable();
    table.text('description');
    table.specificType('tags', 'varchar(100)[]').defaultTo('{}');
    table.string('type', 50).notNullable();

    // 当前状态
    table.string('current_version', 50);
    table.string('state', 20).notNullable().defaultTo('draft');

    // 归属
    table.specificType('owners', 'uuid[]').defaultTo('{}');
    table.uuid('team_id').index();
    table.uuid('project_id').notNullable().index();

    // 自动审批配置
    table.boolean('auto_approval_enabled').defaultTo(false);
    table.string('auto_approval_threshold', 20);

    // 时间戳
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by');
    table.uuid('updated_by');

    // 软删除字段（P0）
    table.timestamp('deleted_at', { useTz: true });
    table.uuid('deleted_by');

    // 索引
    table.index('project_id');
    table.index('type');
    table.index('state');
    table.index(['updated_at'], 'idx_assets_updated', { order: 'desc' });
  });

  // 部分唯一索引：允许删除后复用 slug
  await knex.raw(`
    CREATE UNIQUE INDEX uq_asset_slug_active
    ON assets (project_id, slug)
    WHERE deleted_at IS NULL
  `);

  // 检查约束
  await knex.raw(`
    ALTER TABLE assets
    ADD CONSTRAINT chk_asset_state
    CHECK (state IN ('draft', 'clean', 'dirty', 'modified', 'archived'))
  `);

  await knex.raw(`
    ALTER TABLE assets
    ADD CONSTRAINT chk_asset_type
    CHECK (type IN ('requirement', 'design', 'task', 'code', 'test', 'pipeline'))
  `);

  // 2. 资产版本表（外键 RESTRICT 防止级联误删）
  await knex.schema.createTable('asset_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('asset_id').notNullable().references('id').inTable('assets').onDelete('RESTRICT');
    table.string('version', 50).notNullable();

    // 内容引用
    table.string('content_ref', 500).notNullable();
    table.string('content_hash', 64);
    table.bigInteger('content_size');

    // 变更说明
    table.text('changelog').notNullable();
    table.string('changelog_summary', 500);

    // 发布信息
    table.string('state', 20).notNullable().defaultTo('draft');
    table.timestamp('published_at', { useTz: true });
    table.uuid('published_by');

    // 创建信息
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by');

    // 唯一约束
    table.unique(['asset_id', 'version']);

    // 索引
    table.index(['asset_id', 'version']);
    table.index(['published_at'], 'idx_versions_published', { order: 'desc' });
    table.index('state');
  });

  // 版本状态检查约束
  await knex.raw(`
    ALTER TABLE asset_versions
    ADD CONSTRAINT chk_version_state
    CHECK (state IN ('draft', 'published', 'deprecated'))
  `);

  // 3. 资产元数据扩展表
  await knex.schema.createTable('asset_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
    table.string('version', 50);

    // 扩展字段
    table.jsonb('metadata').notNullable().defaultTo('{}');

    // 类型化索引字段
    table.string('priority', 20);
    table.string('status', 50);
    table.timestamp('due_date', { useTz: true });
    table.integer('estimated_effort');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.unique(['asset_id', 'version']);
    table.index(['asset_id', 'version']);
  });

  // 4. 依赖关系表（外键 RESTRICT）
  await knex.schema.createTable('dependencies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // 源资产（下游）
    table.uuid('source_asset_id').notNullable().references('id').inTable('assets').onDelete('RESTRICT');
    table.string('source_version', 50).notNullable();

    // 目标资产（上游）
    table.uuid('target_asset_id').notNullable().references('id').inTable('assets').onDelete('RESTRICT');
    table.string('target_version', 50).notNullable();

    // 确认信息
    table.timestamp('confirmed_at', { useTz: true });
    table.uuid('confirmed_by');
    table.boolean('auto_confirmed').defaultTo(false);

    // 创建信息
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by');

    // 唯一约束
    table.unique(['source_asset_id', 'source_version', 'target_asset_id', 'target_version']);

    // 索引
    table.index(['source_asset_id', 'source_version']);
    table.index(['target_asset_id', 'target_version']);
  });

  // 5. ltree 资产路径表（P1：替代递归 CTE）
  await knex.schema.createTable('asset_paths', (table) => {
    table.uuid('asset_id').primary().references('id').inTable('assets').onDelete('CASCADE');
    table.specificType('path', 'ltree').notNullable();
    table.uuid('root_id').notNullable();
    table.integer('depth').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    // ltree 索引
    table.index('path', 'idx_asset_paths_path', 'gist');
    table.index('root_id');
  });

  // 6. 资产状态变更历史
  await knex.schema.createTable('asset_state_transitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
    table.string('version', 50);

    table.string('from_state', 20).notNullable();
    table.string('to_state', 20).notNullable();

    // 触发来源
    table.string('triggered_by', 100).notNullable();
    table.uuid('actor_id');
    table.string('actor_type', 20);

    // 上下文
    table.uuid('upstream_asset_id');
    table.string('upstream_version', 50);

    table.text('reason');
    table.jsonb('metadata');

    table.timestamp('transitioned_at', { useTz: true }).defaultTo(knex.fn.now());

    // 索引
    table.index(['asset_id', 'transitioned_at'], 'idx_state_transitions_asset', { order: 'desc' });
    table.index(['to_state', 'transitioned_at'], 'idx_state_transitions_to', { order: 'desc' });
  });

  // 7. Dirty 来源队列
  await knex.schema.createTable('dirty_sources', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');

    // 上游变更来源
    table.uuid('upstream_asset_id').notNullable().references('id').inTable('assets');
    table.string('upstream_version', 50).notNullable();
    table.timestamp('upstream_published_at', { useTz: true });

    // 影响分析
    table.string('impact_level', 20);
    table.jsonb('impact_analysis');

    // 处理状态
    table.string('status', 20).defaultTo('pending');

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('resolved_at', { useTz: true });

    // 唯一约束
    table.unique(['asset_id', 'upstream_asset_id', 'upstream_version']);

    // 索引
    table.index(['asset_id', 'status'], 'idx_dirty_sources_asset');
    table.index(['upstream_asset_id', 'upstream_version'], 'idx_dirty_sources_upstream');
    // 部分索引：仅针对有 impact_analysis 的记录
    table.index(['impact_analysis'], 'idx_dirty_impact', {
      predicate: knex.raw("(impact_analysis IS NOT NULL)")
    });
  });

  // Dirty 状态检查约束
  await knex.raw(`
    ALTER TABLE dirty_sources
    ADD CONSTRAINT chk_dirty_status
    CHECK (status IN ('pending', 'acknowledged', 'processing', 'resolved'))
  `);

  // 8. 依赖关系变更历史
  await knex.schema.createTable('dependency_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('dependency_id');

    table.uuid('source_asset_id').notNullable();
    table.string('source_version', 50).notNullable();
    table.uuid('target_asset_id').notNullable();
    table.string('target_version', 50).notNullable();

    table.string('operation', 20).notNullable();
    table.timestamp('changed_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('changed_by');
    table.text('reason');
  });

  // 9. 创建更新时间戳触发器函数
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // 为 assets 表添加更新时间戳触发器
  await knex.raw(`
    CREATE TRIGGER tr_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  // 为 asset_metadata 表添加更新时间戳触发器
  await knex.raw(`
    CREATE TRIGGER tr_asset_metadata_updated_at
    BEFORE UPDATE ON asset_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column()
  `);

  // 10. 软删除触发器（清理关联数据）
  await knex.raw(`
    CREATE OR REPLACE FUNCTION handle_asset_soft_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        -- 清理待处理通知（如果有 notifications 表）
        -- UPDATE notifications SET status = 'cancelled' WHERE related_asset_id = NEW.id;

        -- 取消运行中的任务
        -- UPDATE agent_executions SET status = 'cancelled', completed_at = NOW()
        -- WHERE source_asset_id = NEW.id AND status = 'running';

        -- 清理 dirty_sources
        DELETE FROM dirty_sources WHERE asset_id = NEW.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER tr_assets_soft_delete
    AFTER UPDATE ON assets
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    EXECUTE FUNCTION handle_asset_soft_delete()
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 删除触发器
  await knex.raw('DROP TRIGGER IF EXISTS tr_assets_soft_delete ON assets');
  await knex.raw('DROP TRIGGER IF EXISTS tr_assets_updated_at ON assets');
  await knex.raw('DROP TRIGGER IF EXISTS tr_asset_metadata_updated_at ON asset_metadata');

  // 删除函数
  await knex.raw('DROP FUNCTION IF EXISTS handle_asset_soft_delete()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');

  // 删除表（反向顺序）
  await knex.schema.dropTableIfExists('dependency_history');
  await knex.schema.dropTableIfExists('dirty_sources');
  await knex.schema.dropTableIfExists('asset_state_transitions');
  await knex.schema.dropTableIfExists('asset_paths');
  await knex.schema.dropTableIfExists('dependencies');
  await knex.schema.dropTableIfExists('asset_metadata');
  await knex.schema.dropTableIfExists('asset_versions');
  await knex.schema.dropTableIfExists('assets');
}
