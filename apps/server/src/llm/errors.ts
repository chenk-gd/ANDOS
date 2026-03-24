/**
 * LLM error types for ANDOS
 *
 * Provides standardized error handling for LLM provider interactions.
 */

/**
 * Base error class for LLM-related errors
 */
export class LLMError extends Error {
  /**
   * Creates a new LLMError
   * @param message - The error message
   * @param code - The error code
   * @param provider - The provider that raised the error (optional)
   * @param retryable - Whether this error can be retried
   */
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Error thrown when rate limits are exceeded
 */
export class LLMRateLimitError extends LLMError {
  /**
   * Creates a new LLMRateLimitError
   * @param message - The error message
   * @param provider - The provider that raised the error (optional)
   */
  constructor(message: string, provider?: string) {
    super(message, 'RATE_LIMIT', provider, true);
    this.name = 'LLMRateLimitError';
  }
}

/**
 * Error thrown when token limits are exceeded
 */
export class LLMTokenLimitError extends LLMError {
  /**
   * Creates a new LLMTokenLimitError
   * @param message - The error message
   * @param provider - The provider that raised the error (optional)
   */
  constructor(message: string, provider?: string) {
    super(message, 'TOKEN_LIMIT', provider, false);
    this.name = 'LLMTokenLimitError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class LLMAuthenticationError extends LLMError {
  /**
   * Creates a new LLMAuthenticationError
   * @param message - The error message
   * @param provider - The provider that raised the error (optional)
   */
  constructor(message: string, provider?: string) {
    super(message, 'AUTHENTICATION_FAILED', provider, false);
    this.name = 'LLMAuthenticationError';
  }
}

/**
 * Error thrown when the request is invalid
 */
export class LLMValidationError extends LLMError {
  /**
   * Creates a new LLMValidationError
   * @param message - The error message
   * @param provider - The provider that raised the error (optional)
   */
  constructor(message: string, provider?: string) {
    super(message, 'VALIDATION_ERROR', provider, false);
    this.name = 'LLMValidationError';
  }
}

/**
 * Error thrown when the provider is unavailable
 */
export class LLMServiceUnavailableError extends LLMError {
  /**
   * Creates a new LLMServiceUnavailableError
   * @param message - The error message
   * @param provider - The provider that raised the error (optional)
   */
  constructor(message: string, provider?: string) {
    super(message, 'SERVICE_UNAVAILABLE', provider, true);
    this.name = 'LLMServiceUnavailableError';
  }
}
