// Memory System Types

export type MemoryType = 'requirement' | 'design' | 'decision' | 'constraint' | 'context' | 'preference'
export type MemoryStatus = 'active' | 'archived' | 'pending_review'

export interface Memory {
  id: string
  projectId: string
  type: MemoryType
  content: string
  metadata: MemoryMetadata
  status: MemoryStatus
  embedding?: number[]
  createdAt: string
  updatedAt: string
  createdBy: string
  confidence?: number
}

export interface MemoryMetadata {
  source?: string
  assetId?: string
  assetType?: string
  tags?: string[]
  customData?: Record<string, any>
}

export interface MemoryCandidate {
  id: string
  projectId: string
  sessionId: string
  content: string
  type: MemoryType
  confidence: number
  extractedAt: string
  reviewedAt?: string
  reviewedBy?: string
  status: 'pending' | 'approved' | 'rejected'
  feedback?: string
}

export interface MemorySearchResult {
  memory: Memory
  similarity: number
  relevance: number
}

export interface MemoryQuery {
  projectId: string
  query: string
  type?: MemoryType
  limit?: number
  threshold?: number
}

export interface MemoryFeedback {
  memoryId: string
  useful: boolean
  feedback?: string
}

export interface SessionMemory {
  sessionId: string
  projectId: string
  assetId?: string
  context: string
  messages: SessionMessage[]
  tokenCount: number
  maxTokens: number
  createdAt: string
  updatedAt: string
}

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  tokenCount?: number
  memoryRefs?: string[]
}

export interface SessionContext {
  sessionId: string
  messages: SessionMessage[]
  memories: Memory[]
  tokenUsage: TokenUsage
}

export interface TokenUsage {
  current: number
  max: number
  percentage: number
}

export interface MemoryStats {
  totalMemories: number
  byType: Record<MemoryType, number>
  pendingReviews: number
  lastUpdated: string
}

export interface CreateMemoryRequest {
  projectId: string
  type: MemoryType
  content: string
  metadata?: MemoryMetadata
}

export interface UpdateMemoryRequest {
  content?: string
  type?: MemoryType
  metadata?: MemoryMetadata
  status?: MemoryStatus
}

export interface ReviewCandidateRequest {
  candidateId: string
  approved: boolean
  feedback?: string
}

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  requirement: '需求',
  design: '设计',
  decision: '决策',
  constraint: '约束',
  context: '上下文',
  preference: '偏好'
}

export const MEMORY_STATUS_LABELS: Record<MemoryStatus, string> = {
  active: '活跃',
  archived: '已归档',
  pending_review: '待审核'
}
