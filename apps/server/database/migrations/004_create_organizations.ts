import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 创建 ltree 扩展（如果不存在）
  await knex.raw('CREATE EXTENSION IF NOT EXISTS ltree');

  // 创建路径更新函数
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_org_path()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.parent_id IS NULL THEN
        NEW.path = text2ltree(NEW.id::text);
        NEW.level = 1;
      ELSE
        SELECT path || text2ltree(NEW.id::text), level + 1
        INTO NEW.path, NEW.level
        FROM organizations
        WHERE id = NEW.parent_id;

        IF NEW.level > 3 THEN
          RAISE EXCEPTION 'Organization level cannot exceed 3';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 创建组织表
  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('parent_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.string('name', 100).notNullable();
    table.text('description');
    table.integer('level').notNullable().defaultTo(1);
    table.specificType('path', 'ltree');
    table.timestamps(true, true);
  });

  // 创建索引
  await knex.raw('CREATE INDEX idx_org_path ON organizations USING GIST (path)');
  await knex.raw('CREATE INDEX idx_org_parent ON organizations(parent_id)');

  // 创建触发器
  await knex.raw(`
    CREATE TRIGGER org_path_update
    BEFORE INSERT OR UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_org_path()
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 删除触发器
  await knex.raw('DROP TRIGGER IF EXISTS org_path_update ON organizations');

  // 删除表
  await knex.schema.dropTableIfExists('organizations');

  // 删除函数
  await knex.raw('DROP FUNCTION IF EXISTS update_org_path()');
}
