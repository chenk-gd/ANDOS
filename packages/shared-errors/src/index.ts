/**
 * Shared Error Types - ANDOS Platform
 * Used by both @andos/server and @andos/web
 */

// Base API Error
export class ApiError extends Error {
  constructor(
    message: string,
    codeOrStatusCode: string | number,
    statusCodeOrRequestId?: number | string,
    requestIdOrUrl?: string,
    url?: string
  ) {
    super(message);
    this.name = 'ApiError';

    // Handle two different calling conventions:
    // 1. (message, code, statusCode, requestId, url) - server style
    // 2. (message, statusCode, requestId, url) - web style

    if (typeof codeOrStatusCode === 'string') {
      // Server style: (message, code, statusCode, requestId?, url?)
      this.code = codeOrStatusCode;
      this.statusCode = typeof statusCodeOrRequestId === 'number' ? statusCodeOrRequestId : 500;
      this.requestId = typeof requestIdOrUrl === 'string' ? requestIdOrUrl : undefined;
      this.url = url;
    } else {
      // Web style: (message, statusCode, requestId?, url?)
      this.code = String(codeOrStatusCode);
      this.statusCode = codeOrStatusCode;
      this.requestId = typeof statusCodeOrRequestId === 'string' ? statusCodeOrRequestId : undefined;
      this.url = requestIdOrUrl;
    }
  }

  code: string;
  statusCode: number;
  requestId?: string;
  url?: string;
}

// Validation Error
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, undefined, undefined);
    this.name = 'ValidationError';
  }
}

// Not Found Error
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, undefined, undefined);
    this.name = 'NotFoundError';
  }
}

// Conflict Error
export class ConflictError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, undefined, undefined);
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
    super(message, 'IDEMPOTENCY_KEY_CONFLICT', 409, undefined, undefined);
    this.name = 'IdempotencyError';
  }
}
