import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 添加外键约束到 assets 表的 project_id 字段
  await knex.schema.alterTable('assets', (table) => {
    table.uuid('project_id')
      .references('id')
      .inTable('projects')
      .onDelete('CASCADE')
      .alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // 删除外键约束
  await knex.schema.alterTable('assets', (table) => {
    table.dropForeign('project_id');
  });
}
