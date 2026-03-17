import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('username', 50).notNullable().unique();
    table.string('email', 100).notNullable().unique();
    table.string('phone', 20).notNullable().unique();
    table.string('name', 100).notNullable();
    table.string('avatar_url', 500);
    table.string('password_hash', 255).notNullable();
    table.enum('status', ['active', 'inactive', 'suspended']).defaultTo('active');
    table.timestamp('last_login_at');
    table.timestamps(true, true);

    table.index('org_id');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
