/**
 * UserService Tests
 * Tests for user CRUD and authentication
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../../../src/services/UserService';
import { clearMockStorage, setMockTable, getMockTable } from '../../helpers/mockDb';

// Module-level mock storage for sharing between service calls
const mockStorage: Map<string, any[]> = new Map();

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(async (password: string, salt: number) => `hashed_${password}`),
  },
  hash: vi.fn(async (password: string, salt: number) => `hashed_${password}`),
}));

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
        case 'orWhere':
          // orWhere creates an OR condition with previous where clauses
          if (query.condition && queries.length > 0) {
            const orResult = data.filter((row) =>
              Object.entries(query.condition).some(([key, value]) => row[key] === value)
            );
            // Combine with current result (union)
            const combined = [...result];
            for (const row of orResult) {
              if (!combined.some((r) => r.id === row.id)) {
                combined.push(row);
              }
            }
            result = combined;
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
    orWhere: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object') {
        queries.push({ type: 'orWhere', condition: args[0] });
      } else if (typeof args[0] === 'string' && args.length === 2) {
        queries.push({ type: 'orWhere', condition: { [args[0]]: args[1] } });
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
          newRecord.id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
        returning: vi.fn(async (fields?: string[]) => {
          const results = table.slice(-records.length);
          if (fields) {
            return results.map((r: any) => {
              const filtered: any = {};
              fields.forEach((f) => {
                if (f !== 'password_hash') filtered[f] = r[f];
              });
              return filtered;
            });
          }
          return results.map((r: any) => {
            const { password_hash, ...rest } = r;
            return rest;
          });
        }),
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
        returning: vi.fn(async (fields?: string[]) => {
          if (fields) {
            return updated.map((r: any) => {
              const filtered: any = {};
              fields.forEach((f) => {
                if (f !== 'password_hash') filtered[f] = r[f];
              });
              return filtered;
            });
          }
          return updated.map((r: any) => {
            const { password_hash, ...rest } = r;
            return rest;
          });
        }),
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

      mockStorage.set(tableName, table);

      return deleteCount;
    }),
  };

  return builder;
}

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    mockStorage.clear();
    clearMockStorage();
    service = new UserService();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const input = {
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      };

      const user = await service.create(input);

      expect(user).toBeDefined();
      expect(user.username).toBe(input.username);
      expect(user.email).toBe(input.email);
      expect(user.phone).toBe(input.phone);
      expect(user.name).toBe(input.name);
      expect(user.org_id).toBe(input.org_id);
      expect(user.status).toBe('active');
      expect(user.password_hash).toBeUndefined();
    });

    it('should throw when username already exists', async () => {
      const input = {
        org_id: 'org_1',
        username: 'testuser',
        email: 'test1@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      };

      await service.create(input);

      const input2 = {
        org_id: 'org_1',
        username: 'testuser',
        email: 'test2@example.com',
        phone: '0987654321',
        name: 'Another User',
        password: 'password123',
      };

      await expect(service.create(input2)).rejects.toThrow('Username already exists');
    });

    it('should throw when email already exists', async () => {
      const input = {
        org_id: 'org_1',
        username: 'user1',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      };

      await service.create(input);

      const input2 = {
        org_id: 'org_1',
        username: 'user2',
        email: 'test@example.com',
        phone: '0987654321',
        name: 'Another User',
        password: 'password123',
      };

      await expect(service.create(input2)).rejects.toThrow('Email already exists');
    });

    it('should throw when phone already exists', async () => {
      const input = {
        org_id: 'org_1',
        username: 'user1',
        email: 'user1@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      };

      await service.create(input);

      const input2 = {
        org_id: 'org_1',
        username: 'user2',
        email: 'user2@example.com',
        phone: '1234567890',
        name: 'Another User',
        password: 'password123',
      };

      await expect(service.create(input2)).rejects.toThrow('Phone already exists');
    });
  });

  describe('getById', () => {
    it('should get user by id', async () => {
      const created = await service.create({
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      });

      const found = await service.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.username).toBe('testuser');
    });

    it('should return null for non-existent id', async () => {
      const found = await service.getById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getByUsername', () => {
    it('should get user by username', async () => {
      await service.create({
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      });

      const found = await service.getByUsername('testuser');

      expect(found).toBeDefined();
      expect(found?.username).toBe('testuser');
    });

    it('should return null for non-existent username', async () => {
      const found = await service.getByUsername('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('listByOrg', () => {
    it('should list users by organization', async () => {
      await service.create({
        org_id: 'org_1',
        username: 'user1',
        email: 'user1@example.com',
        phone: '1111111111',
        name: 'User One',
        password: 'password123',
      });

      await service.create({
        org_id: 'org_1',
        username: 'user2',
        email: 'user2@example.com',
        phone: '2222222222',
        name: 'User Two',
        password: 'password123',
      });

      await service.create({
        org_id: 'org_2',
        username: 'user3',
        email: 'user3@example.com',
        phone: '3333333333',
        name: 'User Three',
        password: 'password123',
      });

      const users = await service.listByOrg('org_1');

      expect(users).toHaveLength(2);
      expect(users.every((u) => u.org_id === 'org_1')).toBe(true);
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const created = await service.create({
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      });

      const updated = await service.update(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(created.id);
    });

    it('should throw when user not found', async () => {
      await expect(
        service.update('non-existent', { name: 'New Name' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      const created = await service.create({
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      });

      await service.delete(created.id);

      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it('should throw when user is a project member', async () => {
      const created = await service.create({
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      });

      // Add user as project member
      const membersTable = mockStorage.get('project_members') || [];
      membersTable.push({
        id: 'member_1',
        project_id: 'proj_1',
        user_id: created.id,
        role_id: 'role_1',
      });
      mockStorage.set('project_members', membersTable);

      await expect(service.delete(created.id)).rejects.toThrow(
        'Cannot delete user who is a project member'
      );
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      const created = await service.create({
        org_id: 'org_1',
        username: 'testuser',
        email: 'test@example.com',
        phone: '1234567890',
        name: 'Test User',
        password: 'password123',
      });

      await service.updateLastLogin(created.id);

      const updated = await service.getById(created.id);
      expect(updated?.last_login_at).toBeDefined();
    });
  });
});
