import { db } from '../src/db/connection';

async function migrate() {
  console.log('Starting data migration...');

  const [defaultOrg] = await db('organizations')
    .insert({ name: 'Default Organization', level: 1 })
    .returning('*');
  console.log('Created default organization:', defaultOrg.id);

  const [defaultProject] = await db('projects')
    .insert({
      org_id: defaultOrg.id,
      name: 'Default Project',
      status: 'active',
    })
    .returning('*');
  console.log('Created default project:', defaultProject.id);

  const adminRole = await db('roles').where('name', 'project_admin').first();

  await db('assets').update({ project_id: defaultProject.id });
  console.log('Updated existing assets');

  console.log('Migration completed!');
  console.log(`Default Org ID: ${defaultOrg.id}`);
  console.log(`Default Project ID: ${defaultProject.id}`);
}

migrate().catch(console.error).finally(() => process.exit(0));
