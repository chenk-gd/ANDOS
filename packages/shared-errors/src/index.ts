/**
 * Shared Error Types - ANDOS Platform
 * Used by both @andos/server and @andos/web
 */

// Base API Error
export class ApiError extends Error {
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

// Validation Error
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, undefined, undefined, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// Not Found Error
export class NotFoundError extends ApiError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' not found`, 404, undefined, undefined, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

// Conflict Error
export class ConflictError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, undefined, undefined, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

// Idempotency Error
export class IdempotencyError extends ApiError {
  constructor(message: string) {
    super(message, 409, undefined, undefined, 'IDEMPOTENCY_KEY_CONFLICT');
    this.name = 'IdempotencyError';
  }
}
