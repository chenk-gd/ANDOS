/**
 * ProjectService Tests
 * Tests for project CRUD and member management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectService } from '../../../src/services/ProjectService';
import { clearMockStorage, setMockTable, getMockTable } from '../../helpers/mockDb';

// Module-level mock storage for sharing between service calls
const mockStorage: Map<string, any[]> = new Map();

// Mock the db module inline
vi.mock('../../../src/db/connection', () => ({
  db: vi.fn((tableName: string) => createMockQueryBuilder(tableName)),
  withTransaction: vi.fn(async (callback: any) => await callback(vi.fn())),
}));

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
          newRecord.id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        if (!newRecord.status) {
          newRecord.status = 'active';
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

      mockStorage.set(tableName, table);

      return {
        returning: vi.fn(async () => updated),
      };
    }),
  };

  return builder;
}

describe('ProjectService', () => {
  let service: ProjectService;

  beforeEach(() => {
    mockStorage.clear();
    clearMockStorage();

    // Setup roles table with project_admin
    mockStorage.set('roles', [
      {
        id: 'role_admin',
        name: 'project_admin',
        description: 'Project Admin',
        permissions: ['*'],
        is_system: true,
      },
    ]);

    service = new ProjectService();
  });

  describe('create', () => {
    it('should create a project', async () => {
      const input = {
        org_id: 'org_1',
        name: 'Test Project',
        description: 'Test Description',
        created_by: 'user_1',
      };

      const project = await service.create(input);

      expect(project).toBeDefined();
      expect(project.name).toBe(input.name);
      expect(project.description).toBe(input.description);
      expect(project.org_id).toBe(input.org_id);
      expect(project.created_by).toBe(input.created_by);
      expect(project.status).toBe('active');
    });

    it('should auto-assign creator as project admin', async () => {
      const input = {
        org_id: 'org_1',
        name: 'Test Project',
        description: 'Test Description',
        created_by: 'user_1',
      };

      const project = await service.create(input);

      // Check that project_members was populated
      const membersTable = mockStorage.get('project_members') || [];
      const member = membersTable.find(
        (m) => m.project_id === project.id && m.user_id === 'user_1'
      );

      expect(member).toBeDefined();
      expect(member.role_id).toBe('role_admin');
    });
  });

  describe('getById', () => {
    it('should get project by id', async () => {
      const created = await service.create({
        org_id: 'org_1',
        name: 'Test Project',
        description: 'Test Description',
        created_by: 'user_1',
      });

      const found = await service.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Test Project');
    });

    it('should return null for non-existent id', async () => {
      const found = await service.getById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('listByOrg', () => {
    it('should list projects by organization', async () => {
      await service.create({
        org_id: 'org_1',
        name: 'Project 1',
        created_by: 'user_1',
      });

      await service.create({
        org_id: 'org_1',
        name: 'Project 2',
        created_by: 'user_1',
      });

      await service.create({
        org_id: 'org_2',
        name: 'Project 3',
        created_by: 'user_2',
      });

      const projects = await service.listByOrg('org_1');

      expect(projects).toHaveLength(2);
      expect(projects.every((p) => p.org_id === 'org_1')).toBe(true);
    });

    it('should order projects by name', async () => {
      await service.create({
        org_id: 'org_1',
        name: 'Z Project',
        created_by: 'user_1',
      });

      await service.create({
        org_id: 'org_1',
        name: 'A Project',
        created_by: 'user_1',
      });

      const projects = await service.listByOrg('org_1');

      expect(projects[0].name).toBe('A Project');
      expect(projects[1].name).toBe('Z Project');
    });
  });

  describe('update', () => {
    it('should update project', async () => {
      const created = await service.create({
        org_id: 'org_1',
        name: 'Original Name',
        created_by: 'user_1',
      });

      const updated = await service.update(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(created.id);
    });

    it('should throw when project not found', async () => {
      await expect(
        service.update('non-existent', { name: 'New Name' })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('archive', () => {
    it('should archive project', async () => {
      const created = await service.create({
        org_id: 'org_1',
        name: 'To Archive',
        created_by: 'user_1',
      });

      await service.archive(created.id);

      const archived = await service.getById(created.id);
      expect(archived?.status).toBe('archived');
    });
  });
});
