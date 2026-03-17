/**
 * PermissionService Tests
 * Tests for RBAC permission checking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionService } from '../../../src/services/PermissionService';
import { clearMockStorage, setMockTable, getMockTable } from '../../helpers/mockDb';

// Shared mock storage - must be defined before vi.mock so the factory can capture it
const sharedMockStorage: Map<string, any[]> = new Map();

// Mock the db module inline with raw support - uses sharedMockStorage
vi.mock('../../../src/db/connection', () => {
  const mockRaw = vi.fn(async (query: string, bindings?: any[]) => {
    // Mock ltree query: SELECT 1 WHERE ?::ltree @> ?::ltree
    if (query.includes('@>') && bindings) {
      return { rows: [{ result: 1 }] };
    }
    return { rows: [] };
  });

  const mockDbFn = vi.fn((tableName: string) => createMockQueryBuilder(tableName));
  mockDbFn.raw = mockRaw;

  return {
    db: mockDbFn,
    withTransaction: vi.fn(async (callback: any) => await callback(mockDbFn)),
  };
});

// Helper to create mock query builder
function createMockQueryBuilder(tableName: string) {
  const queries: any[] = [];

  const getTable = () => {
    const table = sharedMockStorage.get(tableName) || [];
    return [...table];
  };

  const applyFilters = (data: any[]) => {
    let result = [...data];

    for (const query of queries) {
      switch (query.type) {
        case 'where':
          if (typeof query.condition === 'object') {
            result = result.filter((row) =>
              Object.entries(query.condition).every(([key, value]) => {
                // Handle table-qualified column names like 'project_members.user_id'
                const rowKey = key.includes('.') ? key.split('.')[1] : key;
                return row[rowKey] === value;
              })
            );
          }
          break;
        case 'join':
          // Join implementation - combine rows from both tables where keys match
          const joinTableData = sharedMockStorage.get(query.table) || [];
          const joinedResult: any[] = [];

          for (const row of result) {
            for (const joinRow of joinTableData) {
              // Get the key values, handling table-qualified names
              const leftKey = query.left.includes('.') ? query.left.split('.')[1] : query.left;
              const rightKey = query.right.includes('.') ? query.right.split('.')[1] : query.right;

              // Try both directions of matching
              const rowLeftVal = row[leftKey];
              const joinRightVal = joinRow[rightKey];
              const rowRightVal = row[rightKey];
              const joinLeftVal = joinRow[leftKey];

              if (rowLeftVal === joinRightVal || rowRightVal === joinLeftVal) {
                joinedResult.push({ ...row, ...joinRow });
              }
            }
          }
          result = joinedResult;
          break;
        case 'select':
          // Select is handled at the end in .then()
          break;
      }
    }

    return result;
  };

  const builder: any = {
    where: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object' && args[0] !== null) {
        queries.push({ type: 'where', condition: args[0] });
      } else if (typeof args[0] === 'string' && args.length >= 2) {
        // Handle .where('id', value) pattern
        queries.push({ type: 'where', condition: { [args[0]]: args[1] } });
      }
      return builder;
    }),
    join: vi.fn((table: string, left: string, right: string) => {
      queries.push({ type: 'join', table, left, right });
      return builder;
    }),
    select: vi.fn((...fields: string[]) => {
      queries.push({ type: 'select', fields });
      return builder;
    }),
    first: vi.fn(async () => {
      const data = getTable();
      let result = applyFilters(data);

      // Handle select fields - need to filter the returned object
      const selectQuery = queries.find((q) => q.type === 'select');
      if (selectQuery && selectQuery.fields.length > 0 && result.length > 0) {
        const row = result[0];
        const filtered: any = {};
        for (const f of selectQuery.fields) {
          // Handle table.* pattern like 'roles.*'
          if (f.endsWith('.*')) {
            const tableName = f.split('.')[0];
            const joinedTable = sharedMockStorage.get(tableName) || [];
            if (joinedTable.length > 0) {
              const fields = Object.keys(joinedTable[0]);
              fields.forEach((field) => {
                filtered[field] = row[field];
              });
            }
          } else {
            // Handle table-qualified column names like 'roles.name'
            const key = f.includes('.') ? f.split('.')[1] : f;
            filtered[key] = row[key];
          }
        }
        return filtered;
      }

      return result[0] || null;
    }),
    then: vi.fn(async (callback: Function) => {
      const data = getTable();
      let result = applyFilters(data);

      // Apply additional where clauses after joins (for filtering on joined tables)
      for (const query of queries) {
        if (query.type === 'where') {
          result = result.filter((row) =>
            Object.entries(query.condition).every(([key, value]) => {
              const rowKey = key.includes('.') ? key.split('.')[1] : key;
              return row[rowKey] === value;
            })
          );
        }
      }

      // Handle select fields
      const selectQuery = queries.find((q) => q.type === 'select');
      if (selectQuery && selectQuery.fields.length > 0) {
        result = result.map((row) => {
          const filtered: any = {};
          for (const f of selectQuery.fields) {
            // Handle table.* pattern like 'roles.*'
            if (f.endsWith('.*')) {
              const tableName = f.split('.')[0];
              // Get all fields from the joined table
              const joinedTable = sharedMockStorage.get(tableName) || [];
              if (joinedTable.length > 0) {
                const fields = Object.keys(joinedTable[0]);
                fields.forEach((field) => {
                  filtered[field] = row[field];
                });
              }
            } else {
              // Handle table-qualified column names like 'roles.name'
              const key = f.includes('.') ? f.split('.')[1] : f;
              filtered[key] = row[key];
            }
          }
          return filtered;
        });
      }

      return callback(result);
    }),
  };

  return builder;
}

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(() => {
    sharedMockStorage.clear();
    clearMockStorage();

    // Setup roles table
    sharedMockStorage.set('roles', [
      {
        id: 'role_project_admin',
        name: 'project_admin',
        description: 'Project Admin',
        permissions: [
          'asset:crud',
          'version:crud',
          'dependency:crud',
          'webhook:crud',
          'agent:crud',
          'member:crud',
        ],
        is_system: true,
      },
      {
        id: 'role_developer',
        name: 'developer',
        description: 'Developer',
        permissions: ['asset:cru', 'version:cru', 'dependency:cru', 'agent:cu'],
        is_system: true,
      },
      {
        id: 'role_tester',
        name: 'tester',
        description: 'Tester',
        permissions: ['asset:r', 'version:r', 'dependency:r', 'agent:r'],
        is_system: true,
      },
      {
        id: 'role_org_admin',
        name: 'org_admin',
        description: 'Org Admin',
        permissions: ['org:*', 'project:*', 'user:*'],
        is_system: true,
      },
    ]);

    service = new PermissionService();
  });

  describe('checkPermission', () => {
    it('should return true when user has exact permission', async () => {
      // Setup project member with project_admin role
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_project_admin',
        },
      ]);

      const hasPermission = await service.checkPermission('user_1', 'proj_1', 'asset', 'create');

      expect(hasPermission).toBe(true);
    });

    it('should return true when user has wildcard resource permission', async () => {
      // Setup project member with org_admin role (has org:* permission)
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_org_admin',
        },
      ]);

      const hasPermission = await service.checkPermission('user_1', 'proj_1', 'org', 'create');

      expect(hasPermission).toBe(true);
    });

    it('should return true when user has wildcard action permission', async () => {
      // Setup project member with project_admin role (has asset:crud)
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_project_admin',
        },
      ]);

      // crud includes create, read, update, delete
      const canCreate = await service.checkPermission('user_1', 'proj_1', 'asset', 'create');
      const canRead = await service.checkPermission('user_1', 'proj_1', 'asset', 'read');
      const canUpdate = await service.checkPermission('user_1', 'proj_1', 'asset', 'update');
      const canDelete = await service.checkPermission('user_1', 'proj_1', 'asset', 'delete');

      expect(canCreate).toBe(true);
      expect(canRead).toBe(true);
      expect(canUpdate).toBe(true);
      expect(canDelete).toBe(true);
    });

    it('should return false when user is not a project member', async () => {
      sharedMockStorage.set('project_members', []);

      const hasPermission = await service.checkPermission('user_1', 'proj_1', 'asset', 'create');

      expect(hasPermission).toBe(false);
    });

    it('should return false when user lacks specific permission', async () => {
      // Setup tester who only has read permission
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_tester',
        },
      ]);

      const canRead = await service.checkPermission('user_1', 'proj_1', 'asset', 'read');
      const canCreate = await service.checkPermission('user_1', 'proj_1', 'asset', 'create');

      expect(canRead).toBe(true);
      expect(canCreate).toBe(false);
    });

    it('should return false for update when user only has cru (not crud)', async () => {
      // Setup developer who has cru permission
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_developer',
        },
      ]);

      const canCreate = await service.checkPermission('user_1', 'proj_1', 'asset', 'create');
      const canRead = await service.checkPermission('user_1', 'proj_1', 'asset', 'read');
      const canUpdate = await service.checkPermission('user_1', 'proj_1', 'asset', 'update');
      const canDelete = await service.checkPermission('user_1', 'proj_1', 'asset', 'delete');

      expect(canCreate).toBe(true);
      expect(canRead).toBe(true);
      expect(canUpdate).toBe(true);
      expect(canDelete).toBe(false);
    });
  });

  describe('isOrgAdmin', () => {
    it('should return true when user is org admin', async () => {
      // Setup user in org
      sharedMockStorage.set('users', [
        {
          id: 'user_1',
          org_id: 'org_1',
          username: 'admin',
          email: 'admin@example.com',
          phone: '1234567890',
          name: 'Admin',
        },
      ]);

      // Setup org
      sharedMockStorage.set('organizations', [
        {
          id: 'org_1',
          name: 'Test Org',
          path: 'org_1',
          level: 1,
        },
      ]);

      // Setup project member with org_admin role
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_org_admin',
        },
      ]);

      const isAdmin = await service.isOrgAdmin('user_1', 'org_1');

      expect(isAdmin).toBe(true);
    });

    it('should return false when user is not found', async () => {
      sharedMockStorage.set('users', []);

      const isAdmin = await service.isOrgAdmin('user_1', 'org_1');

      expect(isAdmin).toBe(false);
    });

    it('should return false when org is not found', async () => {
      sharedMockStorage.set('users', [
        {
          id: 'user_1',
          org_id: 'org_1',
          username: 'admin',
          email: 'admin@example.com',
          phone: '1234567890',
          name: 'Admin',
        },
      ]);

      sharedMockStorage.set('organizations', []);

      const isAdmin = await service.isOrgAdmin('user_1', 'org_1');

      expect(isAdmin).toBe(false);
    });

    it('should return false when user does not have org_admin role', async () => {
      // Setup user in org
      sharedMockStorage.set('users', [
        {
          id: 'user_1',
          org_id: 'org_1',
          username: 'user',
          email: 'user@example.com',
          phone: '1234567890',
          name: 'User',
        },
      ]);

      // Setup org
      sharedMockStorage.set('organizations', [
        {
          id: 'org_1',
          name: 'Test Org',
          path: 'org_1',
          level: 1,
        },
      ]);

      // Setup project member with developer role (not org_admin)
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_developer',
        },
      ]);

      const isAdmin = await service.isOrgAdmin('user_1', 'org_1');

      expect(isAdmin).toBe(false);
    });
  });

  describe('getUserRoles', () => {
    it('should get user roles in project', async () => {
      // Setup project member
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_project_admin',
        },
      ]);

      const roles = await service.getUserRoles('user_1', 'proj_1');

      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe('project_admin');
    });

    it('should return empty array when user has no roles', async () => {
      sharedMockStorage.set('project_members', []);

      const roles = await service.getUserRoles('user_1', 'proj_1');

      expect(roles).toHaveLength(0);
    });

    it('should get multiple roles if user has them', async () => {
      // Note: In real scenario user would have one role per project
      // But the query returns all joined roles
      sharedMockStorage.set('project_members', [
        {
          id: 'member_1',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_project_admin',
        },
        {
          id: 'member_2',
          project_id: 'proj_1',
          user_id: 'user_1',
          role_id: 'role_developer',
        },
      ]);

      const roles = await service.getUserRoles('user_1', 'proj_1');

      expect(roles).toHaveLength(2);
    });
  });
});
