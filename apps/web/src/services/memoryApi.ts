import { request } from './api'
import type {
  Memory,
  MemoryCandidate,
  MemorySearchResult,
  MemoryQuery,
  MemoryFeedback,
  SessionMemory,
  SessionContext,
  MemoryStats,
  CreateMemoryRequest,
  UpdateMemoryRequest,
  ReviewCandidateRequest,
} from '@/types/memory'

export const memoryApi = {
  // Project Memory APIs
  async listMemories(projectId: string, params?: { type?: string; status?: string; search?: string }) {
    const query = new URLSearchParams()
    query.append('projectId', projectId)
    if (params?.type) query.append('type', params.type)
    if (params?.status) query.append('status', params.status)
    if (params?.search) query.append('search', params.search)
    return request<Memory[]>(`/v1/memories?${query.toString()}`)
  },

  async getMemory(id: string) {
    return request<Memory>(`/v1/memories/${id}`)
  },

  async createMemory(data: CreateMemoryRequest) {
    return request<Memory>('/v1/memories', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateMemory(id: string, data: UpdateMemoryRequest) {
    return request<Memory>(`/v1/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async deleteMemory(id: string) {
    return request<void>(`/v1/memories/${id}`, {
      method: 'DELETE',
    })
  },

  // Memory Search
  async searchMemories(query: MemoryQuery) {
    return request<MemorySearchResult[]>('/v1/memories/search', {
      method: 'POST',
      body: JSON.stringify(query),
    })
  },

  // Memory Feedback
  async submitFeedback(data: MemoryFeedback) {
    return request<void>('/v1/memories/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Candidate Pool APIs
  async listCandidates(projectId: string, params?: { status?: string; limit?: number }) {
    const query = new URLSearchParams()
    query.append('projectId', projectId)
    if (params?.status) query.append('status', params.status)
    if (params?.limit) query.append('limit', String(params.limit))
    return request<MemoryCandidate[]>(`/v1/memories/candidates?${query.toString()}`)
  },

  async reviewCandidate(data: ReviewCandidateRequest) {
    return request<MemoryCandidate>('/v1/memories/candidates/review', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Session Memory APIs
  async listSessions(projectId: string, assetId?: string) {
    const query = new URLSearchParams()
    query.append('projectId', projectId)
    if (assetId) query.append('assetId', assetId)
    return request<SessionMemory[]>(`/v1/memory/sessions?${query.toString()}`)
  },

  async getSession(sessionId: string) {
    return request<SessionMemory>(`/v1/memory/sessions/${sessionId}`)
  },

  async getSessionContext(sessionId: string) {
    return request<SessionContext>(`/v1/memory/sessions/${sessionId}/context`)
  },

  async createSession(data: { projectId: string; assetId?: string; context?: string }) {
    return request<SessionMemory>('/v1/memory/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async restoreSession(sessionId: string) {
    return request<SessionMemory>(`/v1/memory/sessions/${sessionId}/restore`, {
      method: 'POST',
    })
  },

  async deleteSession(sessionId: string) {
    return request<void>(`/v1/memory/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  },

  // Memory Stats
  async getStats(projectId: string) {
    return request<MemoryStats>(`/v1/memories/stats?projectId=${projectId}`)
  },

  // Memory Context for AI Chat
  async getRelevantMemories(projectId: string, query: string, limit = 5) {
    return request<Memory[]>('/v1/memories/context', {
      method: 'POST',
      body: JSON.stringify({ projectId, query, limit }),
    })
  },
}
