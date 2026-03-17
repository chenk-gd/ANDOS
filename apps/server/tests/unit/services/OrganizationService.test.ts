/**
 * OrganizationService Tests
 * Tests for organization CRUD and tree management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganizationService } from '../../../src/services/OrganizationService';
import { clearMockStorage, setMockTable, getMockTable } from '../../helpers/mockDb';

// Module-level mock storage for sharing between service calls
const mockStorage: Map<string, any[]> = new Map();

// Mock the db module inline
vi.mock('../../../src/db/connection', () => {
  const mockDb = vi.fn((tableName: string) => createMockQueryBuilder(tableName));
  return {
    db: mockDb,
    withTransaction: vi.fn(async (callback: any) => {
      return await callback(mockDb);
    }),
  };
});

// Helper to create mock query builder
function createMockQueryBuilder(tableName: string) {
  const queries: any[] = [];

  const getTable = () => {
    const table = mockStorage.get(tableName) || [];
    return [...table];
  };

  const applyFilters = (data: any[]) => {
    let result = [...data];

    for (const query of queries) {
      switch (query.type) {
        case 'where':
          if (typeof query.condition === 'object') {
            result = result.filter((row) =>
              Object.entries(query.condition).every(([key, value]) => row[key] === value)
            );
          }
          break;
        case 'whereRaw':
          // Handle path ~ 'root.path.*' pattern for ltree
          if (query.raw && query.raw.includes('~') && query.bindings) {
            const pathPattern = query.bindings[0];
            const prefix = pathPattern.replace('.*', '');
            result = result.filter((row) => row.path && row.path.startsWith(prefix));
          }
          break;
        case 'orderBy':
          result.sort((a, b) => {
            const aVal = a[query.field];
            const bVal = b[query.field];
            if (query.direction === 'desc') {
              return bVal > aVal ? 1 : -1;
            }
            return aVal > bVal ? 1 : -1;
          });
          break;
      }
    }

    return result;
  };

  const builder: any = {
    where: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object') {
        queries.push({ type: 'where', condition: args[0] });
      } else if (typeof args[0] === 'string' && args.length === 2) {
        queries.push({ type: 'where', condition: { [args[0]]: args[1] } });
      }
      return builder;
    }),
    whereRaw: vi.fn((raw: string, bindings?: any[]) => {
      queries.push({ type: 'whereRaw', raw, bindings });
      return builder;
    }),
    orderBy: vi.fn((field: string, direction: string) => {
      queries.push({ type: 'orderBy', field, direction });
      return builder;
    }),
    first: vi.fn(async () => {
      const data = getTable();
      const result = applyFilters(data);
      return result[0] || null;
    }),
    then: vi.fn(async (callback: Function) => {
      const data = getTable();
      const result = applyFilters(data);
      return callback(result);
    }),
    insert: vi.fn((data: any) => {
      const records = Array.isArray(data) ? data : [data];
      const table = mockStorage.get(tableName) || [];

      for (const record of records) {
        const newRecord = { ...record };
        if (!newRecord.id) {
          newRecord.id = `org_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }

        // Calculate level and path based on parent
        if (newRecord.parent_id) {
          const parent = table.find((o: any) => o.id === newRecord.parent_id);
          if (parent) {
            newRecord.level = parent.level + 1;
            newRecord.path = `${parent.path}.${newRecord.id}`;
          } else {
            newRecord.level = 1;
            newRecord.path = newRecord.id;
          }
        } else {
          newRecord.level = 1;
          newRecord.path = newRecord.id;
        }

        if (!newRecord.created_at) {
          newRecord.created_at = new Date();
        }
        if (!newRecord.updated_at) {
          newRecord.updated_at = new Date();
        }
        table.push(newRecord);
      }

      mockStorage.set(tableName, table);

      return {
        returning: vi.fn(async () => table.slice(-records.length)),
      };
    }),
    update: vi.fn((data: any) => {
      const table = mockStorage.get(tableName) || [];
      let updated: any[] = [];

      for (const row of table) {
        let matches = true;
        for (const query of queries) {
          if (query.type === 'where' && query.condition.id !== undefined) {
            if (row.id !== query.condition.id) {
              matches = false;
            }
          }
        }
        if (matches) {
          Object.assign(row, data, { updated_at: new Date() });
          updated.push(row);
        }
      }

      return {
        returning: vi.fn(async () => updated),
      };
    }),
    delete: vi.fn(async () => {
      const table = mockStorage.get(tableName) || [];
      let deleteCount = 0;

      for (let i = table.length - 1; i >= 0; i--) {
        let matches = true;
        for (const query of queries) {
          if (query.type === 'where' && query.condition.id !== undefined) {
            if (table[i].id !== query.condition.id) {
              matches = false;
            }
          }
        }
        if (matches) {
          table.splice(i, 1);
          deleteCount++;
        }
      }

      return deleteCount;
    }),
  };

  return builder;
}

// Helper to create test organization directly in mock storage
function createTestOrg(overrides: Partial<any> = {}): any {
  const id = `org_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const org = {
    id,
    name: `Test Org ${id}`,
    description: 'Test Description',
    level: 1,
    path: id,
    parent_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };

  const table = mockStorage.get('organizations') || [];
  table.push(org);
  mockStorage.set('organizations', table);

  return org;
}

describe('OrganizationService', () => {
  let service: OrganizationService;

  beforeEach(() => {
    mockStorage.clear();
    clearMockStorage(); // Also clear the helper's storage
    service = new OrganizationService();
  });

  describe('create', () => {
    it('should create a root organization', async () => {
      const input = {
        name: 'Test Org',
        description: 'Test Description',
      };

      const org = await service.create(input);

      expect(org).toBeDefined();
      expect(org.name).toBe(input.name);
      expect(org.description).toBe(input.description);
      expect(org.parent_id).toBeNull();
    });

    it('should create a child organization', async () => {
      // Create parent first
      const parent = await service.create({ name: 'Parent Org' });

      const input = {
        name: 'Child Org',
        parent_id: parent.id,
      };

      const child = await service.create(input);

      expect(child).toBeDefined();
      expect(child.name).toBe(input.name);
      expect(child.parent_id).toBe(parent.id);
    });

    it('should throw when parent not found', async () => {
      await expect(
        service.create({ name: 'Test Org', parent_id: 'non-existent' })
      ).rejects.toThrow('Parent organization not found');
    });

    it('should throw when creating beyond level 3', async () => {
      // Create level 1
      const level1 = await service.create({ name: 'Level 1' });

      // Create level 2
      const level2 = await service.create({ name: 'Level 2', parent_id: level1.id });

      // Create level 3
      const level3 = await service.create({ name: 'Level 3', parent_id: level2.id });

      // Try to create level 4
      await expect(
        service.create({ name: 'Level 4', parent_id: level3.id })
      ).rejects.toThrow('Cannot create organization beyond level 3');
    });
  });

  describe('getById', () => {
    it('should get organization by id', async () => {
      const created = createTestOrg({ name: 'Test Org' });
      const found = await service.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Test Org');
    });

    it('should return null for non-existent id', async () => {
      const found = await service.getById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getTree', () => {
    it('should return all organizations as tree', async () => {
      // Create hierarchy
      const root = createTestOrg({ name: 'Root' });
      const child1 = createTestOrg({ name: 'Child 1', parent_id: root.id, level: 2, path: `${root.path}.child1` });
      const child2 = createTestOrg({ name: 'Child 2', parent_id: root.id, level: 2, path: `${root.path}.child2` });

      const tree = await service.getTree();

      expect(tree).toBeDefined();
      expect(Array.isArray(tree)).toBe(true);
    });

    it('should return empty array for non-existent root', async () => {
      const tree = await service.getTree('non-existent');
      expect(tree).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update organization', async () => {
      const created = createTestOrg({ name: 'Original Name' });
      const updated = await service.update(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(created.id);
    });

    it('should throw when organization not found', async () => {
      await expect(
        service.update('non-existent', { name: 'New Name' })
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('delete', () => {
    it('should delete organization', async () => {
      const created = createTestOrg({ name: 'To Delete' });
      await service.delete(created.id);

      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it('should throw when organization has children', async () => {
      const parent = createTestOrg({ name: 'Parent' });
      createTestOrg({ name: 'Child', parent_id: parent.id, level: 2, path: `${parent.path}.child` });

      await expect(service.delete(parent.id)).rejects.toThrow(
        'Cannot delete organization with children'
      );
    });

    it('should throw when organization has users', async () => {
      const org = createTestOrg({ name: 'Org With Users' });

      // Add a user to the org
      const usersTable = mockStorage.get('users') || [];
      usersTable.push({
        id: 'user_1',
        org_id: org.id,
        username: 'testuser',
        email: 'test@test.com',
        phone: '1234567890',
        name: 'Test User',
      });
      mockStorage.set('users', usersTable);

      await expect(service.delete(org.id)).rejects.toThrow(
        'Cannot delete organization with users'
      );
    });

    it('should throw when organization has projects', async () => {
      const org = createTestOrg({ name: 'Org With Projects' });

      // Add a project to the org
      const projectsTable = mockStorage.get('projects') || [];
      projectsTable.push({
        id: 'proj_1',
        org_id: org.id,
        name: 'Test Project',
        status: 'active',
      });
      mockStorage.set('projects', projectsTable);

      await expect(service.delete(org.id)).rejects.toThrow(
        'Cannot delete organization with projects'
      );
    });
  });
});
