/**
 * DependencyGraphService Tests
 * Tests for graph building and visualization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DependencyGraphService } from '../../../src/services/DependencyGraphService';
import { clearMockStorage, setMockTable, getMockTable } from '../../helpers/mockDb';

// Mock the db module inline
vi.mock('../../../src/db/connection', () => ({
  db: vi.fn((tableName: string) => createMockQueryBuilder(tableName)),
  withTransaction: vi.fn(async (callback: any) => await callback(vi.fn())),
}));

// Helper to create mock query builder
function createMockQueryBuilder(tableName: string) {
  const queries: any[] = [];

  const builder: any = {
    where: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object') {
        queries.push({ type: 'where', condition: args[0] });
      }
      return builder;
    }),
    whereNotNull: vi.fn((field: string) => {
      queries.push({ type: 'whereNotNull', field });
      return builder;
    }),
    whereNull: vi.fn((field: string) => {
      queries.push({ type: 'whereNull', field });
      return builder;
    }),
    whereNot: vi.fn(() => builder),
    whereIn: vi.fn(() => builder),
    whereRaw: vi.fn((raw: string, bindings?: any[]) => {
      queries.push({ type: 'whereRaw', raw, bindings });
      return builder;
    }),
    orWhere: vi.fn(() => builder),
    join: vi.fn(() => builder),
    orderBy: vi.fn((field: string, direction: string) => {
      queries.push({ type: 'orderBy', field, direction });
      return builder;
    }),
    limit: vi.fn((n: number) => {
      queries.push({ type: 'limit', n });
      return builder;
    }),
    offset: vi.fn(() => builder),
    select: vi.fn(() => builder),
    distinct: vi.fn(() => builder),
    count: vi.fn((field: string) => {
      queries.push({ type: 'count', field });
      return builder;
    }),
    sum: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    first: vi.fn(async () => {
      const data = getMockTable(tableName);
      let result = [...data];

      // Apply where conditions
      for (const query of queries) {
        if (query.type === 'where') {
          result = result.filter((row) =>
            Object.entries(query.condition).every(([key, value]) => row[key] === value)
          );
        } else if (query.type === 'whereNull') {
          result = result.filter((row) => row[query.field] === null || row[query.field] === undefined);
        } else if (query.type === 'whereNotNull') {
          result = result.filter((row) => row[query.field] !== null && row[query.field] !== undefined);
        }
      }

      return result[0] || null;
    }),
    then: vi.fn(async (callback: Function) => {
      const data = getMockTable(tableName);
      let result = [...data];

      for (const query of queries) {
        switch (query.type) {
          case 'where':
            result = result.filter((row) =>
              Object.entries(query.condition).every(([key, value]) => row[key] === value)
            );
            break;
          case 'whereNull':
            result = result.filter((row) => row[query.field] === null || row[query.field] === undefined);
            break;
          case 'whereNotNull':
            result = result.filter((row) => row[query.field] !== null && row[query.field] !== undefined);
            break;
          case 'whereRaw':
            // Simple mock for whereRaw - just return all results for complex queries
            // The actual filtering would require parsing SQL which is beyond mock scope
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
          case 'limit':
            result = result.slice(0, query.n);
            break;
        }
      }

      const countQuery = queries.find((q) => q.type === 'count');
      if (countQuery) {
        return callback({ count: result.length.toString() });
      }

      return callback(result);
    }),
    insert: vi.fn((data: any) => {
      const records = Array.isArray(data) ? data : [data];
      const table = getMockTable(tableName);

      for (const record of records) {
        const newRecord = { ...record };
        if (!newRecord.id) {
          newRecord.id = `test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        table.push(newRecord);
      }

      setMockTable(tableName, table);

      return {
        returning: vi.fn(async () => table.slice(-records.length)),
      };
    }),
    update: vi.fn((data: any) => ({
      returning: vi.fn(async () => [data]),
    })),
    delete: vi.fn(async () => 0),
    increment: vi.fn(async () => 1),
    onConflict: vi.fn(() => ({ ignore: vi.fn(async () => []) })),
    raw: vi.fn((raw: string) => raw),
  };

  return builder;
}

describe('DependencyGraphService', () => {
  let service: DependencyGraphService;

  beforeEach(() => {
    clearMockStorage();
    service = new DependencyGraphService();
  });

  describe('buildGraph', () => {
    it('should build graph with root node', async () => {
      const rootAsset = {
        id: 'root-asset',
        name: 'Root Asset',
        slug: 'root',
        type: 'requirement',
        state: 'clean',
        current_version: 'v1.0.0',
        project_id: 'project-1',
        deleted_at: null,
      };

      setMockTable('assets', [rootAsset]);
      setMockTable('dependencies', []);

      const graph = await service.buildGraph('root-asset');

      expect(graph).toBeDefined();
      expect(graph.rootId).toBe('root-asset');
      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0].id).toBe('root-asset');
      expect(graph.nodes[0].metadata?.isRoot).toBe(true);
    });

    it('should include downstream dependencies', async () => {
      const rootAsset = {
        id: 'root',
        name: 'Root',
        slug: 'root',
        type: 'requirement',
        state: 'clean',
        current_version: 'v1.0.0',
        project_id: 'project-1',
        deleted_at: null,
      };

      const childAsset = {
        id: 'child',
        name: 'Child',
        slug: 'child',
        type: 'design',
        state: 'clean',
        current_version: 'v1.0.0',
        project_id: 'project-1',
        deleted_at: null,
      };

      const dependency = {
        id: 'dep-1',
        source_asset_id: 'child',
        source_version: 'v1.0.0',
        target_asset_id: 'root',
        target_version: 'v1.0.0',
        confirmed_at: new Date(),
        confirmed_by: 'user-1',
        auto_confirmed: true,
        created_at: new Date(),
      };

      setMockTable('assets', [rootAsset, childAsset]);
      setMockTable('dependencies', [dependency]);

      const graph = await service.buildGraph('root', { direction: 'downstream' });

      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0].source).toBe('root');
      expect(graph.edges[0].target).toBe('child');
    });

    it('should calculate graph statistics', async () => {
      const assets = [
        { id: 'a1', name: 'Asset 1', slug: 'a1', type: 'requirement', state: 'clean', current_version: 'v1', project_id: 'p1', deleted_at: null },
        { id: 'a2', name: 'Asset 2', slug: 'a2', type: 'design', state: 'dirty', current_version: 'v1', project_id: 'p1', deleted_at: null },
        { id: 'a3', name: 'Asset 3', slug: 'a3', type: 'code', state: 'clean', current_version: 'v1', project_id: 'p1', deleted_at: null },
      ];

      // Create dependencies to connect all assets to the graph
      const dependencies = [
        { id: 'dep-1', source_asset_id: 'a2', source_version: 'v1', target_asset_id: 'a1', target_version: 'v1', confirmed_at: new Date(), confirmed_by: 'user-1', auto_confirmed: true, created_at: new Date() },
        { id: 'dep-2', source_asset_id: 'a3', source_version: 'v1', target_asset_id: 'a2', target_version: 'v1', confirmed_at: new Date(), confirmed_by: 'user-1', auto_confirmed: true, created_at: new Date() },
      ];

      setMockTable('assets', assets);
      setMockTable('dependencies', dependencies);

      const graph = await service.buildGraph('a1');

      expect(graph.stats.totalNodes).toBe(3);
      expect(graph.stats.byState.clean).toBe(2);
      expect(graph.stats.byState.dirty).toBe(1);
      expect(graph.stats.byType.requirement).toBe(1);
      expect(graph.stats.byType.design).toBe(1);
      expect(graph.stats.byType.code).toBe(1);
    });

    it('should apply hierarchical layout', async () => {
      const asset = {
        id: 'a1',
        name: 'Asset 1',
        slug: 'a1',
        type: 'requirement',
        state: 'clean',
        current_version: 'v1',
        project_id: 'p1',
        deleted_at: null,
      };

      setMockTable('assets', [asset]);
      setMockTable('dependencies', []);

      const graph = await service.buildGraph('a1', { layout: 'hierarchical' });

      expect(graph.nodes[0].x).toBeDefined();
      expect(graph.nodes[0].y).toBeDefined();
    });
  });

  describe('buildCytoscapeGraph', () => {
    it('should generate Cytoscape format', async () => {
      const asset = {
        id: 'a1',
        name: 'Asset 1',
        slug: 'a1',
        type: 'requirement',
        state: 'clean',
        current_version: 'v1',
        project_id: 'p1',
        deleted_at: null,
      };

      setMockTable('assets', [asset]);
      setMockTable('dependencies', []);

      const result = await service.buildCytoscapeGraph('a1');

      expect(result.elements).toBeDefined();
      expect(result.style).toBeDefined();
      expect(result.layout).toBeDefined();
      expect(result.elements.some((e: any) => e.data?.id === 'a1')).toBe(true);
    });
  });

  describe('buildMermaidGraph', () => {
    it('should generate Mermaid format', async () => {
      const asset = {
        id: 'a1',
        name: 'Asset 1',
        slug: 'a1',
        type: 'requirement',
        state: 'clean',
        current_version: 'v1',
        project_id: 'p1',
        deleted_at: null,
      };

      setMockTable('assets', [asset]);
      setMockTable('dependencies', []);

      const result = await service.buildMermaidGraph('a1');

      expect(result).toContain('graph TD');
      expect(result).toContain('a1');
    });
  });

  describe('buildDotGraph', () => {
    it('should generate DOT format', async () => {
      const asset = {
        id: 'a1',
        name: 'Asset 1',
        slug: 'a1',
        type: 'requirement',
        state: 'clean',
        current_version: 'v1',
        project_id: 'p1',
        deleted_at: null,
      };

      setMockTable('assets', [asset]);
      setMockTable('dependencies', []);

      const result = await service.buildDotGraph('a1');

      expect(result).toContain('digraph DependencyGraph');
      expect(result).toContain('a1');
    });
  });
});
