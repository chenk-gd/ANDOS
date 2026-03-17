/**
 * Error Handler Plugin - AI-Native DevOps Platform
 * Centralized error handling for Fastify
 */

import type { FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import {
  ApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
  IdempotencyError,
} from '@andos/shared-errors';

// Error code mapping from service layer
const serviceErrorToHttp: Record<string, { code: string; status: number }> = {
  ASSET_NOT_FOUND: { code: 'ASSET_NOT_FOUND', status: 404 },
  HAS_DEPENDENCIES: { code: 'ASSET_HAS_DEPENDENCIES', status: 422 },
  DUPLICATE_SLUG: { code: 'ASSET_ALREADY_EXISTS', status: 409 },
  INVALID_STATE_TRANSITION: { code: 'INVALID_STATE_TRANSITION', status: 422 },
  VERSION_NOT_FOUND: { code: 'VERSION_NOT_FOUND', status: 404 },
};

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    request_id?: string;
  };
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  // Set error handler
  fastify.setErrorHandler((error: FastifyError & { code?: string }, request, reply) => {
    const requestId = request.id as string;

    // Log error
    fastify.log.error({
      err: error,
      requestId,
      url: request.url,
      method: request.method,
    }, 'Error occurred');

    // Handle ApiError
    if (error instanceof ApiError) {
      const response: ErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          request_id: requestId,
        },
      };
      if (error.details) {
        response.error.details = error.details;
      }
      return reply.status(error.statusCode).send(response);
    }

    // Handle service layer errors
    const serviceError = serviceErrorToHttp[error.code || ''];
    if (serviceError) {
      const response: ErrorResponse = {
        error: {
          code: serviceError.code,
          message: error.message,
          request_id: requestId,
        },
      };
      return reply.status(serviceError.status).send(response);
    }

    // Handle validation errors (Zod, etc.)
    if (error.validation) {
      const response: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { errors: error.validation },
          request_id: requestId,
        },
      };
      return reply.status(400).send(response);
    }

    // Handle 404
    if (error.statusCode === 404) {
      const response: ErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          request_id: requestId,
        },
      };
      return reply.status(404).send(response);
    }

    // Default: internal server error
    const response: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
        request_id: requestId,
      },
    };

    return reply.status(500).send(response);
  });

  // Set not found handler
  fastify.setNotFoundHandler((request, reply) => {
    const response: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        request_id: request.id as string,
      },
    };
    reply.status(404).send(response);
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
