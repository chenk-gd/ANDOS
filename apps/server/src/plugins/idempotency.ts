/**
 * Idempotency Middleware - AI-Native DevOps Platform
 * P0: Implements Idempotency-Key header support
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/connection';
import { IdempotencyError } from '../plugins/errorHandler';

// In-memory cache for idempotency keys (use Redis in production)
const idempotencyCache = new Map<string, {
  response: any;
  expiresAt: Date;
}>();

// Cleanup expired keys periodically
setInterval(() => {
  const now = new Date();
  for (const [key, value] of idempotencyCache) {
    if (value.expiresAt < now) {
      idempotencyCache.delete(key);
    }
  }
}, 60000); // Every minute

interface IdempotencyConfig {
  windowSeconds?: number;
  methods?: string[];
}

const DEFAULT_CONFIG: IdempotencyConfig = {
  windowSeconds: 3600, // 1 hour
  methods: ['POST', 'PUT', 'PATCH'],
};

/**
 * Calculate request hash for comparison
 */
function hashRequest(body: unknown): string {
  // Simple hash - use crypto in production
  return JSON.stringify(body);
}

/**
 * Idempotency middleware plugin
 */
const idempotencyPlugin: FastifyPluginAsync<IdempotencyConfig> = async (
  fastify,
  options = {}
) => {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Add hook to check idempotency
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only check for configured methods
    if (!config.methods?.includes(request.method)) {
      return;
    }

    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) {
      return; // No key, proceed normally
    }

    // Validate UUID format (simple check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(idempotencyKey)) {
      throw new IdempotencyError('Idempotency-Key must be a valid UUID');
    }

    const cached = idempotencyCache.get(idempotencyKey);
    if (cached) {
      // Check if expired
      if (cached.expiresAt < new Date()) {
        idempotencyCache.delete(idempotencyKey);
        return; // Expired, proceed
      }

      // Key exists and not expired - return cached response
      request.log.info({ idempotencyKey }, 'Idempotency key hit');

      // Mark as idempotent hit
      const response = {
        ...cached.response,
        meta: {
          ...cached.response.meta,
          idempotency_key: idempotencyKey,
          idempotent: true,
        },
      };

      reply.status(200).send(response);
      return reply; // Stop request processing
    }

    // Store key in request for later caching
    (request as any).idempotencyKey = idempotencyKey;
    (request as any).idempotencyExpiresAt = new Date(
      Date.now() + (config.windowSeconds || 3600) * 1000
    );
  });

  // Add hook to cache response
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    const idempotencyKey = (request as any).idempotencyKey;
    if (!idempotencyKey) {
      return payload;
    }

    // Only cache successful responses (2xx)
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const expiresAt = (request as any).idempotencyExpiresAt;
      const response = typeof payload === 'string' ? JSON.parse(payload) : payload;

      // Add idempotency metadata
      const responseWithMeta = {
        ...response,
        meta: {
          ...response.meta,
          idempotency_key: idempotencyKey,
          idempotency_expires_at: expiresAt.toISOString(),
        },
      };

      // Cache response
      idempotencyCache.set(idempotencyKey, {
        response: responseWithMeta,
        expiresAt,
      });

      request.log.info({ idempotencyKey }, 'Idempotency response cached');
      return responseWithMeta;
    }

    return payload;
  });

  // Decorate request with idempotency utility
  fastify.decorateRequest('checkIdempotency', function (body: unknown) {
    const key = (this as any).idempotencyKey;
    if (!key) return null;

    const cached = idempotencyCache.get(key);
    if (cached) {
      const currentHash = hashRequest(body);
      const cachedHash = hashRequest(cached.response.data);

      if (currentHash !== cachedHash) {
        throw new IdempotencyError(
          'Idempotency-Key conflict: request body does not match previous request'
        );
      }
    }
    return key;
  });
};

export default fp(idempotencyPlugin, { name: 'idempotency' });

// Type augmentation for FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    checkIdempotency(body: unknown): string | null;
  }
}
