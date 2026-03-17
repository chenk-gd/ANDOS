/**
 * Types Index - AI-Native DevOps Platform
 */

import type { FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: AuthenticatedUser;
}

export * from './asset';
export * from './agent';
export * from './memory';
export * from './organization';
export * from './project';
export * from './role';
export * from './user';
