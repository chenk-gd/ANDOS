/**
 * Rate Limiting Plugin - AI-Native DevOps Platform
 * P1: Tiered rate limiting with Redis
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';

// Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times) => {
    if (times > 3) {
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000);
  },
});

// Rate limit tiers
export type RateLimitTier = 'anonymous' | 'user' | 'premium' | 'internal';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  burst: number;  // Burst allowance
}

const RATE_LIMITS: Record<RateLimitTier, RateLimitConfig> = {
  anonymous: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 60,
    burst: 10,
  },
  user: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 1000,
    burst: 100,
  },
  premium: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 10000,
    burst: 1000,
  },
  internal: {
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 100000,
    burst: 10000,
  },
};

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Get rate limit key for request
 */
function getRateLimitKey(request: FastifyRequest, tier: RateLimitTier): string {
  const identifier = (request.user as any)?.id || request.ip;
  return `ratelimit:${tier}:${identifier}`;
}

/**
 * Determine rate limit tier for request
 */
function getTier(request: FastifyRequest): RateLimitTier {
  // Internal service detection (via header or IP)
  if (request.headers['x-internal-service'] === 'true') {
    return 'internal';
  }

  // Check user tier from JWT
  const user = request.user as any;
  if (user) {
    return user.tier || 'user';
  }

  return 'anonymous';
}

/**
 * Check rate limit using sliding window
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count current requests
  const currentCount = await redis.zcard(key);

  // Calculate remaining
  const remaining = Math.max(0, config.maxRequests - currentCount);

  // Check if allowed (including burst)
  const allowed = currentCount < config.maxRequests + config.burst;

  // Calculate reset time
  const resetAt = now + config.windowMs;

  if (allowed) {
    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    // Set expiry on key
    await redis.pexpire(key, config.windowMs);
  }

  return {
    allowed,
    limit: config.maxRequests,
    remaining,
    resetAt: Math.floor(resetAt / 1000),  // Unix timestamp
    retryAfter: allowed ? undefined : Math.ceil(config.windowMs / 1000),
  };
}

/**
 * Rate limiting plugin
 */
interface RateLimitOptions {
  excludePaths?: string[];
  skipSuccessfulRequests?: boolean;
}

const rateLimitPlugin: FastifyPluginAsync<RateLimitOptions> = async (
  fastify,
  options = {}
) => {
  const { excludePaths = ['/health'] } = options;

  // Add hook to check rate limit
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip excluded paths
    if (excludePaths.some((path) => request.url.startsWith(path))) {
      return;
    }

    const tier = getTier(request);
    const config = RATE_LIMITS[tier];
    const key = getRateLimitKey(request, tier);

    const result = await checkRateLimit(key, config);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', result.resetAt);

    // Store result for access in route handlers
    (request as any).rateLimit = result;

    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfter);

      const errorResponse = {
        error: {
          code: 'RATE_LIMITED',
          message: 'API rate limit exceeded',
          details: {
            limit: result.limit,
            window: `${config.windowMs / 1000}s`,
            retry_after: result.retryAfter,
            tier,
          },
          request_id: request.id,
        },
      };

      reply.status(429).send(errorResponse);
      return reply;
    }
  });

  // Decorate request with rate limit info
  fastify.decorateRequest('getRateLimitInfo', function () {
    return (this as any).rateLimit;
  });
};

export default fp(rateLimitPlugin, { name: 'rate-limit' });

// Type augmentation
declare module 'fastify' {
  interface FastifyRequest {
    getRateLimitInfo(): RateLimitResult | undefined;
  }
}
