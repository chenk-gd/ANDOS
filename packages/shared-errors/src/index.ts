/**
 * Shared Error Types - ANDOS Platform
 * Used by both @andos/server and @andos/web
 */

// Base API Error
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Validation Error
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

// Not Found Error
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

// Conflict Error
export class ConflictError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

// Network Error
export class NetworkError extends Error {
  constructor(message = '网络连接失败') {
    super(message);
    this.name = 'NetworkError';
  }
}

// Timeout Error
export class TimeoutError extends Error {
  constructor(message = '请求超时') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Idempotency Error
export class IdempotencyError extends ApiError {
  constructor(message: string) {
    super(message, 'IDEMPOTENCY_KEY_CONFLICT', 409);
    this.name = 'IdempotencyError';
  }
}
