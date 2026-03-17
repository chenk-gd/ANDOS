/**
 * Memory Routes Unit Tests
 * Tests for V1.5 Agent Memory System REST API endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock the services module - factory function with inline mocks
vi.mock('@/services', () => {
  return {
    sessionMemoryService: {
      createCheckpoint: vi.fn(),
      listCheckpoints: vi.fn(),
      getLatestCheckpoint: vi.fn(),
      restoreFromCheckpoint: vi.fn(),
      deleteCheckpoint: vi.fn(),
      cleanupExpiredSessions: vi.fn(),
    },
    projectMemoryService: {
      getProjectMemory: vi.fn(),
      getProjectContext: vi.fn(),
      updateProjectContext: vi.fn(),
      queryPatterns: vi.fn(),
      recordPattern: vi.fn(),
    },
    mcpMemoryTools: {
      remember: vi.fn(),
      forget: vi.fn(),
      search: vi.fn(),
      listTools: vi.fn(),
    },
    autoMemoryExtractionService: {
      getPendingCandidates: vi.fn(),
      processCandidateFeedback: vi.fn(),
    },
  };
});

// Mock @andos/shared-errors
vi.mock('@andos/shared-errors', () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public requestId?: string,
      public url?: string,
      public code?: string,
      public details?: Record<string, unknown>
    ) {
      super(message);
      this.name = 'ApiError';
    }
  }

  class NotFoundError extends ApiError {
    constructor(resource: string, id: string) {
      super(`${resource} with id '${id}' not found`, 404, undefined, undefined, 'NOT_FOUND');
      this.name = 'NotFoundError';
    }
  }

  class ValidationError extends ApiError {
    constructor(message: string, details?: Record<string, unknown>) {
      super(message, 400, undefined, undefined, 'VALIDATION_ERROR', details);
      this.name = 'ValidationError';
    }
  }

  return {
    ApiError,
    NotFoundError,
    ValidationError,
  };
});

// Import after mocks
import memoryRoutes from '@/routes/memory';
import errorHandler from '@/plugins/errorHandler';
import {
  sessionMemoryService,
  projectMemoryService,
  mcpMemoryTools,
  autoMemoryExtractionService,
} from '@/services';

describe('Memory Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    // Register error handler to properly transform errors
    await app.register(errorHandler);
    await app.register(memoryRoutes);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Session Checkpoints', () => {
    describe('POST /sessions/:sessionId/checkpoints', () => {
      it('should create a checkpoint', async () => {
        const mockCheckpoint = {
          id: 'cp-123',
          session_id: 'session-123',
          state: { key: 'value' },
          trigger: 'manual',
          created_at: new Date().toISOString(),
        };
        vi.mocked(sessionMemoryService.createCheckpoint).mockResolvedValue(mockCheckpoint);

        const response = await app.inject({
          method: 'POST',
          url: '/sessions/session-123/checkpoints',
          payload: {
            state: { key: 'value' },
            trigger: 'manual',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data).toEqual(mockCheckpoint);
      });

      it('should use default trigger when not provided', async () => {
        const mockCheckpoint = {
          id: 'cp-123',
          session_id: 'session-123',
          state: { key: 'value' },
          trigger: 'manual',
          created_at: new Date().toISOString(),
        };
        vi.mocked(sessionMemoryService.createCheckpoint).mockResolvedValue(mockCheckpoint);

        const response = await app.inject({
          method: 'POST',
          url: '/sessions/session-123/checkpoints',
          payload: {
            state: { key: 'value' },
          },
        });

        expect(response.statusCode).toBe(201);
        expect(sessionMemoryService.createCheckpoint).toHaveBeenCalledWith(
          'session-123',
          { key: 'value' },
          'manual'
        );
      });

      it('should return 400 for invalid request body', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/sessions/session-123/checkpoints',
          payload: {
            // Missing required 'state' field
            trigger: 'manual',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /sessions/:sessionId/checkpoints', () => {
      it('should list checkpoints for a session', async () => {
        const mockCheckpoints = [
          {
            id: 'cp-1',
            session_id: 'session-123',
            state: { step: 1 },
            trigger: 'auto',
            created_at: new Date().toISOString(),
          },
          {
            id: 'cp-2',
            session_id: 'session-123',
            state: { step: 2 },
            trigger: 'manual',
            created_at: new Date().toISOString(),
          },
        ];
        vi.mocked(sessionMemoryService.listCheckpoints).mockResolvedValue(mockCheckpoints);

        const response = await app.inject({
          method: 'GET',
          url: '/sessions/session-123/checkpoints',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(2);
      });
    });

    describe('POST /sessions/:sessionId/restore', () => {
      it('should restore from specific checkpoint', async () => {
        const mockState = { step: 5, data: 'test' };
        vi.mocked(sessionMemoryService.restoreFromCheckpoint).mockResolvedValue(mockState);

        const response = await app.inject({
          method: 'POST',
          url: '/sessions/session-123/restore',
          payload: {
            checkpoint_id: 'cp-123',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.state).toEqual(mockState);
      });

      it('should restore from latest checkpoint when no checkpoint_id provided', async () => {
        const mockCheckpoint = {
          id: 'cp-latest',
          session_id: 'session-123',
          state: { step: 10 },
          trigger: 'auto',
          created_at: new Date().toISOString(),
        };
        vi.mocked(sessionMemoryService.getLatestCheckpoint).mockResolvedValue(mockCheckpoint);

        const response = await app.inject({
          method: 'POST',
          url: '/sessions/session-123/restore',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.state).toEqual(mockCheckpoint.state);
      });

      it('should return 404 when no checkpoints exist', async () => {
        vi.mocked(sessionMemoryService.getLatestCheckpoint).mockResolvedValue(null);

        const response = await app.inject({
          method: 'POST',
          url: '/sessions/session-123/restore',
          payload: {},
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('GET /sessions/:sessionId/checkpoints/:checkpointId', () => {
      it('should get checkpoint details', async () => {
        const mockCheckpoint = {
          id: 'cp-123',
          session_id: 'session-123',
          state: { key: 'value' },
          trigger: 'manual',
          created_at: new Date().toISOString(),
        };
        vi.mocked(sessionMemoryService.listCheckpoints).mockResolvedValue([mockCheckpoint]);

        const response = await app.inject({
          method: 'GET',
          url: '/sessions/session-123/checkpoints/cp-123',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.id).toBe('cp-123');
      });

      it('should return 404 for non-existent checkpoint', async () => {
        vi.mocked(sessionMemoryService.listCheckpoints).mockResolvedValue([]);

        const response = await app.inject({
          method: 'GET',
          url: '/sessions/session-123/checkpoints/nonexistent',
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /sessions/:sessionId/checkpoints/:checkpointId', () => {
      it('should delete a checkpoint', async () => {
        vi.mocked(sessionMemoryService.deleteCheckpoint).mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'DELETE',
          url: '/sessions/session-123/checkpoints/cp-123',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Checkpoint deleted successfully');
      });
    });
  });

  describe('Project Memory', () => {
    describe('GET /projects/:projectId/memory', () => {
      it('should get project memory context', async () => {
        const mockProjectMemory = {
          id: 'proj-123',
          name: 'Test Project',
        };
        const mockContext = {
          code_style_preferences: { naming_conventions: {} },
          api_patterns: [],
        };
        vi.mocked(projectMemoryService.getProjectMemory).mockResolvedValue(mockProjectMemory);
        vi.mocked(projectMemoryService.getProjectContext).mockResolvedValue(mockContext);

        const response = await app.inject({
          method: 'GET',
          url: '/projects/proj-123/memory',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.id).toBe('proj-123');
        expect(body.data.shared_context).toEqual(mockContext);
      });
    });

    describe('PUT /projects/:projectId/memory', () => {
      it('should update project memory context', async () => {
        const mockContext = {
          code_style_preferences: { naming_conventions: { camelCase: 'preferred' } },
        };
        vi.mocked(projectMemoryService.updateProjectContext).mockResolvedValue(undefined);
        vi.mocked(projectMemoryService.getProjectContext).mockResolvedValue(mockContext);

        const response = await app.inject({
          method: 'PUT',
          url: '/projects/proj-123/memory',
          payload: {
            shared_context: {
              code_style_preferences: {
                naming_conventions: { camelCase: 'preferred' },
              },
            },
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.shared_context).toEqual(mockContext);
      });
    });

    describe('GET /projects/:projectId/patterns', () => {
      it('should get learned patterns', async () => {
        const mockPatterns = [
          {
            id: 'pattern-1',
            project_id: 'proj-123',
            type: 'api',
            name: 'REST API Pattern',
            pattern: { method: 'GET' },
          },
        ];
        vi.mocked(projectMemoryService.queryPatterns).mockResolvedValue(mockPatterns);

        const response = await app.inject({
          method: 'GET',
          url: '/projects/proj-123/patterns',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
      });

      it('should filter patterns by type', async () => {
        vi.mocked(projectMemoryService.queryPatterns).mockResolvedValue([]);

        const response = await app.inject({
          method: 'GET',
          url: '/projects/proj-123/patterns?type=api',
        });

        expect(response.statusCode).toBe(200);
        expect(projectMemoryService.queryPatterns).toHaveBeenCalledWith(
          'proj-123',
          [],
          { type: 'api', limit: 50 }
        );
      });
    });

    describe('POST /projects/:projectId/patterns', () => {
      it('should record a new pattern', async () => {
        const mockPattern = {
          id: 'pattern-123',
          project_id: 'proj-123',
          type: 'api',
          name: 'New Pattern',
          pattern: { method: 'POST' },
          frequency: 1,
          confidence: 1.0,
          last_observed_at: new Date(),
        };
        vi.mocked(projectMemoryService.recordPattern).mockResolvedValue(mockPattern);

        const response = await app.inject({
          method: 'POST',
          url: '/projects/proj-123/patterns',
          payload: {
            type: 'api',
            name: 'New Pattern',
            pattern: { method: 'POST' },
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.name).toBe('New Pattern');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/projects/proj-123/patterns',
          payload: {
            // Missing type, name, pattern
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('MCP Memory Tools', () => {
    describe('POST /remember', () => {
      it('should store a memory', async () => {
        const mockResult = {
          key: 'memory-123',
          content: 'Important memory',
          level: 'session',
          namespace: 'default',
          tags: ['tag1'],
        };
        vi.mocked(mcpMemoryTools.remember).mockResolvedValue(mockResult);

        const response = await app.inject({
          method: 'POST',
          url: '/remember',
          payload: {
            content: 'Important memory',
            level: 'session',
            namespace: 'default',
            tags: ['tag1'],
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.content).toBe('Important memory');
      });

      it('should return 400 for invalid level', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/remember',
          payload: {
            content: 'Test',
            level: 'invalid-level',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /forget', () => {
      it('should remove a memory', async () => {
        const mockResult = { success: true };
        vi.mocked(mcpMemoryTools.forget).mockResolvedValue(mockResult);

        const response = await app.inject({
          method: 'POST',
          url: '/forget',
          payload: {
            key: 'memory-123',
            level: 'session',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
      });
    });

    describe('POST /search', () => {
      it('should search memories', async () => {
        const mockResults = [
          { key: 'memory-1', content: 'Test memory', score: 0.95 },
        ];
        vi.mocked(mcpMemoryTools.search).mockResolvedValue(mockResults);

        const response = await app.inject({
          method: 'POST',
          url: '/search',
          payload: {
            query: 'test',
            level: 'session',
            limit: 10,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
      });
    });

    describe('GET /tools', () => {
      it('should list available tools', async () => {
        const mockTools = [
          { name: 'memory_remember', description: 'Store a memory' },
          { name: 'memory_forget', description: 'Remove a memory' },
        ];
        vi.mocked(mcpMemoryTools.listTools).mockReturnValue(mockTools);

        const response = await app.inject({
          method: 'GET',
          url: '/tools',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(2);
      });
    });
  });

  describe('Memory Candidates', () => {
    describe('GET /candidates', () => {
      it('should get pending candidates', async () => {
        const mockCandidates = [
          {
            id: 'candidate-1',
            content: 'Test candidate',
            status: 'pending',
          },
        ];
        vi.mocked(autoMemoryExtractionService.getPendingCandidates).mockResolvedValue(mockCandidates);

        const response = await app.inject({
          method: 'GET',
          url: '/candidates',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
      });

      it('should filter by status', async () => {
        vi.mocked(autoMemoryExtractionService.getPendingCandidates).mockResolvedValue([]);

        const response = await app.inject({
          method: 'GET',
          url: '/candidates?status=approved',
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /candidates/:id/approve', () => {
      it('should approve a candidate', async () => {
        vi.mocked(autoMemoryExtractionService.processCandidateFeedback).mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/candidates/candidate-1/approve',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Candidate approved successfully');
      });
    });

    describe('POST /candidates/:id/reject', () => {
      it('should reject a candidate', async () => {
        vi.mocked(autoMemoryExtractionService.processCandidateFeedback).mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/candidates/candidate-1/reject',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Candidate rejected successfully');
      });
    });

    describe('POST /candidates/:id/edit', () => {
      it('should edit and approve a candidate', async () => {
        vi.mocked(autoMemoryExtractionService.processCandidateFeedback).mockResolvedValue(undefined);

        const response = await app.inject({
          method: 'POST',
          url: '/candidates/candidate-1/edit',
          payload: {
            content: 'Edited content',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Candidate edited and approved successfully');
      });

      it('should return 400 for missing content', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/candidates/candidate-1/edit',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Cleanup', () => {
    describe('POST /cleanup', () => {
      it('should clean up expired sessions', async () => {
        vi.mocked(sessionMemoryService.cleanupExpiredSessions).mockResolvedValue(5);

        const response = await app.inject({
          method: 'POST',
          url: '/cleanup',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.data.deleted_count).toBe(5);
        expect(body.message).toBe('Cleaned up 5 expired session checkpoints');
      });
    });
  });
});
