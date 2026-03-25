/**
 * Common API Types
 */

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  meta?: {
    total?: number
    page?: number
    limit?: number
    description?: string
  }
}

export interface ApiError {
  message: string
  statusCode: number
  requestId?: string | null
  url?: string
}
