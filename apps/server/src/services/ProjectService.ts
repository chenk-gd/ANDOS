import { db } from '../db/connection';
import { Project, CreateProjectInput, UpdateProjectInput } from '../types/project';

export class ProjectService {
  async create(input: CreateProjectInput): Promise<Project> {
    const [project] = await db('projects')
      .insert({
        org_id: input.org_id,
        name: input.name,
        description: input.description,
        created_by: input.created_by,
      })
      .returning('*');

    const adminRole = await db('roles').where('name', 'project_admin').first();
    if (adminRole) {
      await db('project_members').insert({
        project_id: project.id,
        user_id: input.created_by,
        role_id: adminRole.id,
      });
    }

    return project;
  }

  async getById(id: string): Promise<Project | null> {
    return db('projects').where('id', id).first();
  }

  async listByOrg(orgId: string): Promise<Project[]> {
    return db('projects').where('org_id', orgId).orderBy('name');
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const [updated] = await db('projects')
      .where('id', id)
      .update({ ...input, updated_at: new Date() })
      .returning('*');

    if (!updated) throw new Error('Project not found');
    return updated;
  }

  async archive(id: string): Promise<void> {
    await db('projects').where('id', id).update({ status: 'archived' });
  }
}

export const projectService = new ProjectService();
