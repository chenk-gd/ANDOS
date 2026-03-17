import { db } from '../db/connection';
import { Role, Permission } from '../types/role';

export class PermissionService {
  async checkPermission(
    userId: string,
    projectId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const member = await db('project_members')
      .where({ project_id: projectId, user_id: userId })
      .first();

    if (!member) return false;

    const role = await db('roles').where('id', member.role_id).first();
    if (!role) return false;

    const requiredPermission = `${resource}:${action}`;
    return this.hasPermission(role.permissions, requiredPermission);
  }

  async isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    if (!user) return false;

    const org = await db('organizations').where('id', orgId).first();
    if (!org) return false;

    const userOrg = await db('organizations').where('id', user.org_id).first();
    if (!userOrg) return false;

    const isInTree = await db.raw(
      'SELECT 1 WHERE ?::ltree @> ?::ltree',
      [org.path, userOrg.path]
    );

    if (!isInTree.rows.length) return false;

    const member = await db('project_members')
      .join('roles', 'project_members.role_id', 'roles.id')
      .where({
        'project_members.user_id': userId,
        'roles.name': 'org_admin'
      })
      .first();

    return !!member;
  }

  private hasPermission(permissions: Permission[], required: string): boolean {
    // Map action names to single-letter codes
    const actionToCode: Record<string, string> = {
      'create': 'c',
      'read': 'r',
      'update': 'u',
      'delete': 'd'
    };

    for (const perm of permissions) {
      if (perm === required) return true;

      const [permResource, permActions] = perm.split(':');
      const [reqResource, reqAction] = required.split(':');

      if (permResource === reqResource || permResource === '*') {
        if (permActions === '*') return true;
        // Check if the action code is in the permission actions
        const actionCode = actionToCode[reqAction];
        if (actionCode && permActions.includes(actionCode)) {
          return true;
        }
      }
    }
    return false;
  }

  async getUserRoles(userId: string, projectId: string): Promise<Role[]> {
    return db('project_members')
      .join('roles', 'project_members.role_id', 'roles.id')
      .where({
        'project_members.user_id': userId,
        'project_members.project_id': projectId
      })
      .select('roles.*');
  }
}

export const permissionService = new PermissionService();
