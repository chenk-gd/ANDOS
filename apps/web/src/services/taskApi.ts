/**
 * Task API Service
 * Phase 9.6: Workflow Orchestration - Web UI
 *
 * API client for task management endpoints
 */

import type { ApiResponse } from '@/types/api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1'

// Task types
export type TaskStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed'

export type TaskType =
  | 'code_generation'
  | 'code_update'
  | 'test_generation'
  | 'test_update'
  | 'compatibility_check'
  | 'review'

export type TaskPriority = 'high' | 'medium' | 'low'

export type ReviewDecision = 'approve' | 'reject' | 'modify'

export interface Task {
  id: string
  name: string
  description: string
  type: 'task'
  state: TaskStatus
  metadata: {
    task_type: TaskType
    priority: TaskPriority
    acceptance_criteria: string[]
    estimated_effort?: number
    source_asset_id?: string
    impact_asset_id?: string
    assigned_agent?: string
    suggested_agent?: string
    router_recommendation?: {
      agent_id: string
      confidence: number
      reason: string
    }
    reviewed_by?: string
    reviewed_at?: string
    review_decision?: ReviewDecision
    review_notes?: string
    execution_started_at?: string
    execution_completed_at?: string
    execution_output?: string
    execution_artifacts?: string[]
    execution_error?: string
    execution_retry_count?: number
    escalated_to_user?: boolean
  }
  project_id: string
  created_at: string
  updated_at: string
}

export interface TaskFilter {
  project_id?: string
  status?: TaskStatus
  task_type?: TaskType
  priority?: TaskPriority
  assigned_to?: string
  search?: string
  includeDeleted?: boolean
}

export interface ReviewTaskRequest {
  decision: ReviewDecision
  notes?: string
  modifications?: {
    title?: string
    description?: string
    priority?: TaskPriority
    assigned_agent?: string
    acceptance_criteria?: string[]
    estimated_effort?: number
  }
}

export interface ReviewTaskResponse {
  task_id: string
  decision: string
  new_state: string
  requires_routing: boolean
}

export interface BatchReviewRequest {
  task_ids: string[]
  decision: 'approve' | 'reject'
  notes?: string
}

export interface BatchReviewResponse {
  processed: number
  approved: number
  rejected: number
  failed: number
  errors: Array<{ task_id: string; error: string }>
}

export interface AssignTaskRequest {
  agent_id: string
}

export interface TaskStats {
  total: number
  by_status: Record<string, number>
  by_priority: Record<string, number>
  by_type: Record<string, number>
  pending_review_count: number
  assigned_to_me_count: number
}

export interface AttentionRequired {
  pending_review: Task[]
  assigned_to_me: Task[]
  recently_rejected: Task[]
}

// Helper for API requests
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
    throw new Error(errorData.error || errorData.message || `Request failed: ${response.status}`)
  }

  return response.json()
}

export const taskApi = {
  /**
   * List tasks with filters
   */
  async listTasks(filters: TaskFilter = {}): Promise<Task[]> {
    const params = new URLSearchParams()

    if (filters.project_id) params.set('project_id', filters.project_id)
    if (filters.status) params.set('status', filters.status)
    if (filters.task_type) params.set('task_type', filters.task_type)
    if (filters.priority) params.set('priority', filters.priority)
    if (filters.assigned_to) params.set('assigned_to', filters.assigned_to)
    if (filters.search) params.set('search', filters.search)
    if (filters.includeDeleted) params.set('includeDeleted', 'true')

    const query = params.toString()
    const response = await request<ApiResponse<Task[]>>(`/tasks${query ? `?${query}` : ''}`)

    if (!response.success) {
      throw new Error(response.error || 'Failed to list tasks')
    }

    return response.data || []
  },

  /**
   * Get task by ID
   */
  async getTask(id: string): Promise<Task> {
    const response = await request<ApiResponse<Task>>(`/tasks/${id}`)

    if (!response.success) {
      throw new Error(response.error || 'Failed to get task')
    }

    return response.data!
  },

  /**
   * Review a task (approve/reject/modify)
   */
  async reviewTask(
    id: string,
    request: ReviewTaskRequest
  ): Promise<ReviewTaskResponse> {
    const response = await request<ApiResponse<ReviewTaskResponse>>(`/tasks/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.success) {
      throw new Error(response.error || 'Failed to review task')
    }

    return response.data!
  },

  /**
   * Batch review tasks
   */
  async batchReview(request: BatchReviewRequest): Promise<BatchReviewResponse> {
    const response = await request<ApiResponse<BatchReviewResponse>>('/tasks/batch-review', {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.success) {
      throw new Error(response.error || 'Failed to batch review')
    }

    return response.data!
  },

  /**
   * Assign task to agent
   */
  async assignTask(id: string, agentId: string): Promise<void> {
    const response = await request<ApiResponse<void>>(`/tasks/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
    })

    if (!response.success) {
      throw new Error(response.error || 'Failed to assign task')
    }
  },

  /**
   * Get task statistics
   */
  async getTaskStats(projectId?: string): Promise<TaskStats> {
    const params = projectId ? `?project_id=${projectId}` : ''
    const response = await request<ApiResponse<TaskStats>>(`/tasks/stats/overview${params}`)

    if (!response.success) {
      throw new Error(response.error || 'Failed to get task stats')
    }

    return response.data!
  },

  /**
   * Get tasks requiring attention
   */
  async getAttentionRequired(projectId?: string): Promise<AttentionRequired> {
    const params = projectId ? `?project_id=${projectId}` : ''
    const response = await request<ApiResponse<AttentionRequired>>(
      `/tasks/attention/required${params}`
    )

    if (!response.success) {
      throw new Error(response.error || 'Failed to get attention required')
    }

    return response.data!
  },

  /**
   * Get pending review tasks
   */
  async getPendingReview(projectId?: string): Promise<Task[]> {
    const params = projectId ? `?project_id=${projectId}` : ''
    const response = await request<ApiResponse<Task[]>>(`/tasks/status/pending-review${params}`)

    if (!response.success) {
      throw new Error(response.error || 'Failed to get pending review tasks')
    }

    return response.data || []
  },
}

export default taskApi
