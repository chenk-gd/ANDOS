/**
 * Fastify Server - AI-Native DevOps Platform
 * Main entry point for the API server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';

import errorHandler from './plugins/errorHandler';
import idempotency from './plugins/idempotency';
import rateLimit from './plugins/rateLimit';
import assetRoutes from './routes/assets';
import versionRoutes from './routes/versions';
import dependencyRoutes from './routes/dependencies';
import agentRoutes from './routes/agents';
import graphRoutes from './routes/graph';
import webhookRoutes from './routes/webhooks';
import memoryRoutes from './routes/memory';
import { orgRoutes } from './routes/orgs';
import { userRoutes } from './routes/users';
import { projectRoutes } from './routes/projects';
import { projectMemberRoutes } from './routes/projectMembers';
import { authMiddleware } from './middleware/auth';
import { fieldFilteringHook } from './utils/fieldFiltering';
import { setGlobalLogger } from './utils/logger';

dotenv.config();

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
});

// Set global logger for use in other modules
setGlobalLogger(server.log);

// Register plugins
async function registerPlugins(): Promise<void> {
  // Error handling (first to catch all errors)
  await server.register(errorHandler);

  // Idempotency middleware (P0)
  await server.register(idempotency);

  // Rate limiting (P1)
  await server.register(rateLimit, {
    excludePaths: ['/health'],
  });

  // CORS
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  });

  // JWT Authentication (if JWT_SECRET is set)
  if (process.env.JWT_SECRET) {
    await server.register(jwt, {
      secret: process.env.JWT_SECRET,
      sign: {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      },
    });
  }

  // Field filtering hook (P1)
  server.addHook('onSend', fieldFilteringHook);

  // Global auth middleware (skip auth routes)
  server.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/health') || request.url.startsWith('/v1/auth/')) {
      return;
    }
    await authMiddleware(request, reply);
  });
}

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
async function start(): Promise<void> {
  try {
    await registerPlugins();

    // Register routes
    await server.register(assetRoutes, { prefix: '/v1/assets' });
    await server.register(versionRoutes, { prefix: '/v1/assets' });
    await server.register(dependencyRoutes, { prefix: '/v1/dependencies' });
    await server.register(agentRoutes, { prefix: '/v1/agents' });
    await server.register(graphRoutes, { prefix: '/v1/assets' });
    await server.register(webhookRoutes, { prefix: '/v1/webhooks' });
    await server.register(memoryRoutes, { prefix: '/v1/memory' });

    // Organization & RBAC routes
    await server.register(orgRoutes, { prefix: '/v1/orgs' });
    await server.register(userRoutes, { prefix: '/v1' });
    await server.register(projectRoutes, { prefix: '/v1' });
    await server.register(projectMemberRoutes, { prefix: '/v1/projects' });

    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    server.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  server.log.info('SIGTERM received, closing server...');
  await server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  server.log.info('SIGINT received, closing server...');
  await server.close();
  process.exit(0);
});

// Global error handlers
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  server.log.error({ reason, promise }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error: Error) => {
  server.log.error(error, 'Uncaught Exception');
  // Graceful shutdown
  server.close().then(() => {
    process.exit(1);
  });
});

start();
