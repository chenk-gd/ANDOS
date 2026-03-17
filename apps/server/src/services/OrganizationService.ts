import { db } from '../db/connection';
import { Organization, CreateOrganizationInput, UpdateOrganizationInput, OrganizationTree } from '../types/organization';

export class OrganizationService {
  async create(input: CreateOrganizationInput): Promise<Organization> {
    if (input.parent_id) {
      const parent = await db('organizations').where('id', input.parent_id).first();
      if (!parent) throw new Error('Parent organization not found');
      if (parent.level >= 3) {
        throw new Error('Cannot create organization beyond level 3');
      }
    }

    const [org] = await db('organizations')
      .insert({
        parent_id: input.parent_id || null,
        name: input.name,
        description: input.description,
      })
      .returning('*');

    return org;
  }

  async getById(id: string): Promise<Organization | null> {
    return db('organizations').where('id', id).first();
  }

  async getTree(rootId?: string): Promise<OrganizationTree[]> {
    let query = db('organizations').orderBy('path');

    if (rootId) {
      const root = await this.getById(rootId);
      if (!root) return [];
      query = query.where('path', '~', `${root.path}.*`);
    }

    const orgs = await query;
    return this.buildTree(orgs);
  }

  private buildTree(orgs: Organization[]): OrganizationTree[] {
    const map = new Map<string, OrganizationTree>();
    const roots: OrganizationTree[] = [];

    orgs.forEach(org => {
      map.set(org.id, {
        id: org.id,
        name: org.name,
        level: org.level,
        children: []
      });
    });

    orgs.forEach(org => {
      const node = map.get(org.id)!;
      if (org.parent_id && map.has(org.parent_id)) {
        const parent = map.get(org.parent_id)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async update(id: string, input: UpdateOrganizationInput): Promise<Organization> {
    const [updated] = await db('organizations')
      .where('id', id)
      .update({ ...input, updated_at: new Date() })
      .returning('*');

    if (!updated) throw new Error('Organization not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    const hasChildren = await db('organizations').where('parent_id', id).first();
    if (hasChildren) throw new Error('Cannot delete organization with children');

    const hasUsers = await db('users').where('org_id', id).first();
    if (hasUsers) throw new Error('Cannot delete organization with users');

    const hasProjects = await db('projects').where('org_id', id).first();
    if (hasProjects) throw new Error('Cannot delete organization with projects');

    await db('organizations').where('id', id).delete();
  }
}

export const organizationService = new OrganizationService();
