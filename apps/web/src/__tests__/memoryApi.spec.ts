import { describe, it, expect, beforeEach, vi } from 'vitest'
import { memoryApi } from '@/services/memoryApi'
import type { Memory, MemoryCandidate, SessionMemory, CreateMemoryRequest } from '@/types/memory'

// Mock the api module
vi.mock('@/services/api', () => ({
  request: vi.fn(),
}))

import { request } from '@/services/api'

describe('Memory API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listMemories', () => {
    it('fetches memories with projectId', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem-1',
          projectId: 'proj-1',
          type: 'requirement',
          content: 'Test requirement',
          metadata: {},
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          createdBy: 'user-1',
        },
      ]
      vi.mocked(request).mockResolvedValue(mockMemories)

      const result = await memoryApi.listMemories('proj-1')

      expect(request).toHaveBeenCalledWith('/v1/memories?projectId=proj-1')
      expect(result).toEqual(mockMemories)
    })

    it('fetches memories with filters', async () => {
      const mockMemories: Memory[] = []
      vi.mocked(request).mockResolvedValue(mockMemories)

      await memoryApi.listMemories('proj-1', {
        type: 'design',
        status: 'active',
        search: 'test',
      })

      expect(request).toHaveBeenCalledWith(
        '/v1/memories?projectId=proj-1&type=design&status=active&search=test'
      )
    })
  })

  describe('getMemory', () => {
    it('fetches a single memory by id', async () => {
      const mockMemory: Memory = {
        id: 'mem-1',
        projectId: 'proj-1',
        type: 'decision',
        content: 'Test decision',
        metadata: { source: 'session-1' },
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        createdBy: 'user-1',
        confidence: 0.9,
      }
      vi.mocked(request).mockResolvedValue(mockMemory)

      const result = await memoryApi.getMemory('mem-1')

      expect(request).toHaveBeenCalledWith('/v1/memories/mem-1')
      expect(result).toEqual(mockMemory)
    })
  })

  describe('createMemory', () => {
    it('creates a new memory with JSON body', async () => {
      const createData: CreateMemoryRequest = {
        projectId: 'proj-1',
        type: 'context',
        content: 'New memory content',
        metadata: { tags: ['important'] },
      }
      const mockResponse: Memory = {
        ...createData,
        id: 'mem-new',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        createdBy: 'user-1',
        metadata: { tags: ['important'] },
      }
      vi.mocked(request).mockResolvedValue(mockResponse)

      const result = await memoryApi.createMemory(createData)

      expect(request).toHaveBeenCalledWith('/v1/memories', {
        method: 'POST',
        body: JSON.stringify(createData),
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('updateMemory', () => {
    it('updates a memory with JSON body', async () => {
      const updateData = {
        content: 'Updated content',
        status: 'archived' as const,
      }
      const mockResponse: Memory = {
        id: 'mem-1',
        projectId: 'proj-1',
        type: 'requirement',
        content: 'Updated content',
        metadata: {},
        status: 'archived',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        createdBy: 'user-1',
      }
      vi.mocked(request).mockResolvedValue(mockResponse)

      const result = await memoryApi.updateMemory('mem-1', updateData)

      expect(request).toHaveBeenCalledWith('/v1/memories/mem-1', {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('deleteMemory', () => {
    it('deletes a memory', async () => {
      vi.mocked(request).mockResolvedValue(undefined)

      await memoryApi.deleteMemory('mem-1')

      expect(request).toHaveBeenCalledWith('/v1/memories/mem-1', {
        method: 'DELETE',
      })
    })
  })

  describe('searchMemories', () => {
    it('searches memories with JSON body', async () => {
      const query = {
        projectId: 'proj-1',
        query: 'search term',
        type: 'design' as const,
        limit: 10,
      }
      const mockResults = [
        {
          memory: {
            id: 'mem-1',
            projectId: 'proj-1',
            type: 'design',
            content: 'Design pattern',
            metadata: {},
            status: 'active',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            createdBy: 'user-1',
          },
          similarity: 0.95,
          relevance: 0.9,
        },
      ]
      vi.mocked(request).mockResolvedValue(mockResults)

      const result = await memoryApi.searchMemories(query)

      expect(request).toHaveBeenCalledWith('/v1/memories/search', {
        method: 'POST',
        body: JSON.stringify(query),
      })
      expect(result).toEqual(mockResults)
    })
  })

  describe('submitFeedback', () => {
    it('submits feedback with JSON body', async () => {
      const feedback = {
        memoryId: 'mem-1',
        useful: true,
        feedback: 'Very helpful',
      }
      vi.mocked(request).mockResolvedValue(undefined)

      await memoryApi.submitFeedback(feedback)

      expect(request).toHaveBeenCalledWith('/v1/memories/feedback', {
        method: 'POST',
        body: JSON.stringify(feedback),
      })
    })
  })

  describe('listCandidates', () => {
    it('fetches candidates with projectId', async () => {
      const mockCandidates: MemoryCandidate[] = [
        {
          id: 'cand-1',
          projectId: 'proj-1',
          sessionId: 'sess-1',
          content: 'Candidate content',
          type: 'requirement',
          confidence: 0.85,
          extractedAt: '2024-01-01T00:00:00Z',
          status: 'pending',
        },
      ]
      vi.mocked(request).mockResolvedValue(mockCandidates)

      const result = await memoryApi.listCandidates('proj-1')

      expect(request).toHaveBeenCalledWith('/v1/memories/candidates?projectId=proj-1')
      expect(result).toEqual(mockCandidates)
    })

    it('fetches candidates with filters', async () => {
      vi.mocked(request).mockResolvedValue([])

      await memoryApi.listCandidates('proj-1', { status: 'pending', limit: 20 })

      expect(request).toHaveBeenCalledWith(
        '/v1/memories/candidates?projectId=proj-1&status=pending&limit=20'
      )
    })
  })

  describe('reviewCandidate', () => {
    it('reviews a candidate with JSON body', async () => {
      const reviewData = {
        candidateId: 'cand-1',
        approved: true,
        feedback: 'Good memory',
      }
      const mockResponse: MemoryCandidate = {
        id: 'cand-1',
        projectId: 'proj-1',
        sessionId: 'sess-1',
        content: 'Candidate content',
        type: 'requirement',
        confidence: 0.85,
        extractedAt: '2024-01-01T00:00:00Z',
        reviewedAt: '2024-01-02T00:00:00Z',
        reviewedBy: 'user-1',
        status: 'approved',
        feedback: 'Good memory',
      }
      vi.mocked(request).mockResolvedValue(mockResponse)

      const result = await memoryApi.reviewCandidate(reviewData)

      expect(request).toHaveBeenCalledWith('/v1/memories/candidates/review', {
        method: 'POST',
        body: JSON.stringify(reviewData),
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('Session Memory APIs', () => {
    describe('listSessions', () => {
      it('fetches sessions with projectId', async () => {
        const mockSessions: SessionMemory[] = [
          {
            sessionId: 'sess-1',
            projectId: 'proj-1',
            context: 'Test session',
            messages: [],
            tokenCount: 100,
            maxTokens: 4000,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ]
        vi.mocked(request).mockResolvedValue(mockSessions)

        const result = await memoryApi.listSessions('proj-1')

        expect(request).toHaveBeenCalledWith('/v1/memory/sessions?projectId=proj-1')
        expect(result).toEqual(mockSessions)
      })

      it('fetches sessions with assetId filter', async () => {
        vi.mocked(request).mockResolvedValue([])

        await memoryApi.listSessions('proj-1', 'asset-1')

        expect(request).toHaveBeenCalledWith(
          '/v1/memory/sessions?projectId=proj-1&assetId=asset-1'
        )
      })
    })

    describe('getSession', () => {
      it('fetches a session by id', async () => {
        const mockSession: SessionMemory = {
          sessionId: 'sess-1',
          projectId: 'proj-1',
          context: 'Test context',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Hello',
              timestamp: '2024-01-01T00:00:00Z',
            },
          ],
          tokenCount: 50,
          maxTokens: 4000,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
        vi.mocked(request).mockResolvedValue(mockSession)

        const result = await memoryApi.getSession('sess-1')

        expect(request).toHaveBeenCalledWith('/v1/memory/sessions/sess-1')
        expect(result).toEqual(mockSession)
      })
    })

    describe('createSession', () => {
      it('creates a session with JSON body', async () => {
        const sessionData = {
          projectId: 'proj-1',
          assetId: 'asset-1',
          context: 'New session',
        }
        const mockResponse: SessionMemory = {
          sessionId: 'sess-new',
          ...sessionData,
          messages: [],
          tokenCount: 0,
          maxTokens: 4000,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
        vi.mocked(request).mockResolvedValue(mockResponse)

        const result = await memoryApi.createSession(sessionData)

        expect(request).toHaveBeenCalledWith('/v1/memory/sessions', {
          method: 'POST',
          body: JSON.stringify(sessionData),
        })
        expect(result).toEqual(mockResponse)
      })
    })

    describe('restoreSession', () => {
      it('restores a session', async () => {
        const mockSession: SessionMemory = {
          sessionId: 'sess-1',
          projectId: 'proj-1',
          context: 'Restored session',
          messages: [],
          tokenCount: 100,
          maxTokens: 4000,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        }
        vi.mocked(request).mockResolvedValue(mockSession)

        const result = await memoryApi.restoreSession('sess-1')

        expect(request).toHaveBeenCalledWith('/v1/memory/sessions/sess-1/restore', {
          method: 'POST',
        })
        expect(result).toEqual(mockSession)
      })
    })

    describe('deleteSession', () => {
      it('deletes a session', async () => {
        vi.mocked(request).mockResolvedValue(undefined)

        await memoryApi.deleteSession('sess-1')

        expect(request).toHaveBeenCalledWith('/v1/memory/sessions/sess-1', {
          method: 'DELETE',
        })
      })
    })
  })

  describe('getStats', () => {
    it('fetches memory stats', async () => {
      const mockStats = {
        totalMemories: 100,
        byType: {
          requirement: 30,
          design: 20,
          decision: 15,
          constraint: 10,
          context: 15,
          preference: 10,
        },
        pendingReviews: 5,
        lastUpdated: '2024-01-01T00:00:00Z',
      }
      vi.mocked(request).mockResolvedValue(mockStats)

      const result = await memoryApi.getStats('proj-1')

      expect(request).toHaveBeenCalledWith('/v1/memories/stats?projectId=proj-1')
      expect(result).toEqual(mockStats)
    })
  })

  describe('getRelevantMemories', () => {
    it('fetches relevant memories with JSON body', async () => {
      const mockMemories: Memory[] = [
        {
          id: 'mem-1',
          projectId: 'proj-1',
          type: 'context',
          content: 'Relevant content',
          metadata: {},
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          createdBy: 'user-1',
        },
      ]
      vi.mocked(request).mockResolvedValue(mockMemories)

      const result = await memoryApi.getRelevantMemories('proj-1', 'query', 5)

      expect(request).toHaveBeenCalledWith('/v1/memories/context', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1', query: 'query', limit: 5 }),
      })
      expect(result).toEqual(mockMemories)
    })

    it('uses default limit of 5', async () => {
      vi.mocked(request).mockResolvedValue([])

      await memoryApi.getRelevantMemories('proj-1', 'query')

      expect(request).toHaveBeenCalledWith('/v1/memories/context', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1', query: 'query', limit: 5 }),
      })
    })
  })
})
