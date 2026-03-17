import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 50).notNullable().unique();
    table.text('description');
    table.jsonb('permissions').notNullable().defaultTo('[]');
    table.boolean('is_system').defaultTo(false);
    table.timestamps(true, true);
  });

  // 插入预定义角色
  await knex('roles').insert([
    {
      name: 'org_admin',
      description: '组织管理员，可管理整个组织树',
      permissions: JSON.stringify(['org:*', 'project:*', 'user:*']),
      is_system: true
    },
    {
      name: 'project_admin',
      description: '项目管理员',
      permissions: JSON.stringify(['asset:crud', 'version:crud', 'dependency:crud', 'webhook:crud', 'agent:crud', 'member:crud']),
      is_system: true
    },
    {
      name: 'project_manager',
      description: '项目经理',
      permissions: JSON.stringify(['asset:crud', 'version:crud', 'dependency:crud', 'webhook:r', 'agent:r', 'member:r']),
      is_system: true
    },
    {
      name: 'product_manager',
      description: '产品经理',
      permissions: JSON.stringify(['asset:cr', 'version:cru', 'dependency:r', 'agent:r']),
      is_system: true
    },
    {
      name: 'developer',
      description: '开发人员',
      permissions: JSON.stringify(['asset:cru', 'version:cru', 'dependency:cru', 'agent:cu']),
      is_system: true
    },
    {
      name: 'tester',
      description: '测试人员',
      permissions: JSON.stringify(['asset:r', 'version:r', 'dependency:r', 'agent:r']),
      is_system: true
    },
    {
      name: 'qa',
      description: 'QA',
      permissions: JSON.stringify(['asset:r', 'version:r', 'dependency:r', 'webhook:r', 'agent:r']),
      is_system: true
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('roles');
}
