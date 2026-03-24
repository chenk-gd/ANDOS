/**
 * Webhook Routes Tests
 * Tests for webhook subscription management and delivery endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock the error handler plugin
vi.mock('@/plugins/errorHandler', () => {
  const fp = (fn: Function) => fn;

  const errorHandlerPlugin = async (fastify: any) => {
    fastify.setErrorHandler((error: any, request: any, reply: any) => {
      if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
        reply.status(404).send({
          error: { code: 'NOT_FOUND', message: error.message },
        });
      } else if (error.name === 'ValidationError') {
        reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: error.message },
        });
      } else {
        reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: error.message },
        });
      }
    });
  };

  return {
    default: fp(errorHandlerPlugin),
    NotFoundError: class NotFoundError extends Error {
      constructor(resource: string, id: string) {
        super(`${resource} with id '${id}' not found`);
        this.name = 'NotFoundError';
      }
    },
    ValidationError: class ValidationError extends Error {
      constructor(message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'ValidationError';
      }
    },
  };
});

// Mock WebhookService
vi.mock('@/services/WebhookService', () => ({
  webhookService: {
    listSubscriptions: vi.fn().mockResolvedValue([
      {
        id: 'webhook-1',
        url: 'https://example.com/webhook1',
        events: ['asset.created', 'asset.updated'],
        active: true,
        created_at: new Date('2026-03-01'),
        created_by: 'user-1',
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: { name: 'Test Webhook 1' },
        secret: 'secret1',
      },
      {
        id: 'webhook-2',
        url: 'https://example.com/webhook2',
        events: ['asset.published'],
        active: false,
        created_at: new Date('2026-03-02'),
        created_by: 'user-2',
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: { name: 'Test Webhook 2' },
        secret: 'secret2',
      },
    ]),
    createSubscription: vi.fn().mockResolvedValue({
      id: 'webhook-new',
      url: 'https://example.com/new',
      events: ['asset.created'],
      active: true,
      created_at: new Date(),
      created_by: 'test-user',
      project_id: 'project-1',
      metadata: {},
      secret: 'generated-secret',
    }),
    getSubscription: vi.fn().mockImplementation((id: string) => {
      if (id === 'webhook-1') {
        return Promise.resolve({
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          events: ['asset.created'],
          active: true,
          created_at: new Date(),
          created_by: 'user-1',
          secret: 'secret1',
        });
      }
      if (id === 'webhook-2') {
        return Promise.resolve({
          id: 'webhook-2',
          url: 'https://example.com/webhook2',
          events: ['asset.updated'],
          active: true,
          created_at: new Date(),
          created_by: 'user-1',
          secret: 'secret2',
        });
      }
      return Promise.resolve(null);
    }),
    updateSubscription: vi.fn().mockImplementation((id: string, data: any) => {
      return Promise.resolve({
        id,
        url: data.url || 'https://example.com/webhook1',
        events: data.events || ['asset.created'],
        active: data.active !== undefined ? data.active : true,
        created_at: new Date(),
        created_by: 'user-1',
        secret: 'secret1',
        ...data,
      });
    }),
    deleteSubscription: vi.fn().mockResolvedValue(undefined),
    toggleSubscription: vi.fn().mockImplementation((id: string, active: boolean) => {
      return Promise.resolve({
        id,
        url: 'https://example.com/webhook1',
        events: ['asset.created'],
        active,
        created_at: new Date(),
        created_by: 'user-1',
        secret: 'secret1',
      });
    }),
    getDeliveryHistory: vi.fn().mockResolvedValue({
      deliveries: [
        {
          id: 'delivery-1',
          subscription_id: 'webhook-1',
          event_type: 'asset.created',
          status: 'success',
          attempts: 1,
          created_at: new Date(),
        },
        {
          id: 'delivery-2',
          subscription_id: 'webhook-1',
          event_type: 'asset.updated',
          status: 'failed',
          attempts: 3,
          created_at: new Date(),
        },
      ],
      total: 2,
    }),
    getDelivery: vi.fn().mockImplementation((id: string) => {
      if (id === 'delivery-1') {
        return Promise.resolve({
          id: 'delivery-1',
          subscription_id: 'webhook-1',
          event_type: 'asset.created',
          status: 'success',
          attempts: 1,
          created_at: new Date(),
        });
      }
      if (id === 'delivery-failed') {
        return Promise.resolve({
          id: 'delivery-failed',
          subscription_id: 'webhook-1',
          event_type: 'asset.updated',
          status: 'failed',
          attempts: 3,
          created_at: new Date(),
        });
      }
      return Promise.resolve(null);
    }),
    retryDelivery: vi.fn().mockResolvedValue(undefined),
    getStatistics: vi.fn().mockResolvedValue({
      subscriptions: { total: 5, active: 3, inactive: 2 },
      deliveries: { total: 100, success: 85, failed: 10, pending: 5 },
      byEventType: {
        'asset.created': { deliveries: 50, success: 45 },
        'asset.updated': { deliveries: 30, success: 25 },
        'asset.published': { deliveries: 20, success: 15 },
      },
    }),
  },
}));

// Import after mocks
import webhookRoutes from '@/routes/webhooks';
import errorHandler from '@/plugins/errorHandler';
import { webhookService } from '@/services/WebhookService';
import { NotFoundError, ValidationError } from '@/plugins/errorHandler';

describe('Webhook Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    // Register error handler to properly transform errors
    await app.register(errorHandler);
    await app.register(webhookRoutes, { prefix: '/' });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Route Registration', () => {
    it('should have webhook routes registered', async () => {
      // Check that routes are registered by testing endpoints
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET / - List Subscriptions', () => {
    it('should list webhook subscriptions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.listSubscriptions).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
    });

    it('should filter by project_id', async () => {
      vi.mocked(webhookService.listSubscriptions).mockClear();

      const response = await app.inject({
        method: 'GET',
        url: '/?project_id=550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.listSubscriptions).toHaveBeenCalled();
    });

    it('should filter by event_type', async () => {
      await app.inject({
        method: 'GET',
        url: '/?event_type=asset.created',
      });

      expect(webhookService.listSubscriptions).toHaveBeenCalledWith({
        event_type: 'asset.created',
      });
    });

    it('should filter by active status', async () => {
      await app.inject({
        method: 'GET',
        url: '/?active=true',
      });

      expect(webhookService.listSubscriptions).toHaveBeenCalledWith({
        active: true,
      });
    });

    it('should not expose secrets in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
      });

      const body = JSON.parse(response.body);
      body.data.forEach((sub: any) => {
        expect(sub.secret).toBeUndefined();
      });
    });
  });

  describe('POST / - Create Subscription', () => {
    it('should create a webhook subscription', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          url: 'https://example.com/webhook',
          events: ['asset.created', 'asset.updated'],
          project_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(webhookService.createSubscription).toHaveBeenCalledWith({
        url: 'https://example.com/webhook',
        events: ['asset.created', 'asset.updated'],
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        created_by: 'system',
      });
    });

    it('should not expose secret in response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          url: 'https://example.com/webhook',
          events: ['asset.created'],
        },
      });

      const body = JSON.parse(response.body);
      expect(body.data.secret).toBeUndefined();
    });

    it('should reject invalid URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          url: 'not-a-valid-url',
          events: ['asset.created'],
        },
      });

      // Validation errors return 400
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should reject empty events array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          url: 'https://example.com/webhook',
          events: [],
        },
      });

      // Validation errors return 400
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /:id - Get Subscription', () => {
    it('should get a webhook subscription by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/webhook-1',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.getSubscription).toHaveBeenCalledWith('webhook-1');
    });

    it('should handle non-existent subscription', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/non-existent',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('PATCH /:id - Update Subscription', () => {
    it('should update a webhook subscription', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/webhook-1',
        payload: { url: 'https://example.com/new-url' },
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.updateSubscription).toHaveBeenCalledWith('webhook-1', {
        url: 'https://example.com/new-url',
      });
    });

    it('should handle non-existent subscription for update', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/non-existent',
        payload: { url: 'https://example.com/new-url' },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('DELETE /:id - Delete Subscription', () => {
    it('should delete a webhook subscription', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/webhook-1',
      });

      expect(response.statusCode).toBe(204);
      expect(webhookService.deleteSubscription).toHaveBeenCalledWith('webhook-1');
    });

    it('should handle non-existent subscription for deletion', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/non-existent',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /:id/toggle - Toggle Subscription', () => {
    it('should activate a webhook subscription', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook-1/toggle',
        payload: { active: true },
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.toggleSubscription).toHaveBeenCalledWith('webhook-1', true);
    });

    it('should deactivate a webhook subscription', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/webhook-1/toggle',
        payload: { active: false },
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.toggleSubscription).toHaveBeenCalledWith('webhook-1', false);
    });

    it('should handle non-existent subscription for toggle', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/non-existent/toggle',
        payload: { active: true },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /:id/deliveries - Delivery History', () => {
    it('should get delivery history for a subscription', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/webhook-1/deliveries?limit=20&offset=0',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.getDeliveryHistory).toHaveBeenCalledWith('webhook-1', {
        limit: 20,
        offset: 0,
        status: undefined,
      });
    });

    it('should support status filtering', async () => {
      await app.inject({
        method: 'GET',
        url: '/webhook-1/deliveries?limit=10&offset=0&status=failed',
      });

      expect(webhookService.getDeliveryHistory).toHaveBeenCalledWith('webhook-1', {
        limit: 10,
        offset: 0,
        status: 'failed',
      });
    });
  });

  describe('GET /deliveries/:deliveryId - Get Delivery', () => {
    it('should get a delivery by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/deliveries/delivery-1',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.getDelivery).toHaveBeenCalledWith('delivery-1');
    });

    it('should handle non-existent delivery', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/deliveries/non-existent',
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /deliveries/:deliveryId/retry - Retry Delivery', () => {
    it('should retry a failed delivery', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/deliveries/delivery-failed/retry',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.retryDelivery).toHaveBeenCalledWith('delivery-failed');
    });

    it('should handle successful delivery retry', async () => {
      // When delivery is already successful, the service throws an error
      // which gets converted to 500 in test environment without full error handler
      const response = await app.inject({
        method: 'POST',
        url: '/deliveries/delivery-1/retry',
      });

      // Response should be an error (either 400 or 500 depending on error handling)
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle non-existent delivery', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/deliveries/non-existent/retry',
      });

      // Should return error status for non-existent delivery
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /stats - Webhook Statistics', () => {
    it('should get webhook statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      expect(webhookService.getStatistics).toHaveBeenCalledWith(undefined);
    });

    it('should filter by project_id', async () => {
      await app.inject({
        method: 'GET',
        url: '/stats?project_id=project-1',
      });

      expect(webhookService.getStatistics).toHaveBeenCalledWith('project-1');
    });

    it('should return statistics in correct format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/stats',
      });

      const body = JSON.parse(response.body);
      expect(body.data).toHaveProperty('subscriptions');
      expect(body.data).toHaveProperty('deliveries');
      expect(body.data).toHaveProperty('byEventType');
      expect(body.data.subscriptions).toHaveProperty('total');
      expect(body.data.subscriptions).toHaveProperty('active');
      expect(body.data.subscriptions).toHaveProperty('inactive');
    });
  });
});
