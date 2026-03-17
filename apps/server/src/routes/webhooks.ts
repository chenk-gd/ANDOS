/**
 * Webhook Routes - AI-Native DevOps Platform
 * REST API endpoints for webhook subscription management
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { webhookService } from '../services/WebhookService';
import { NotFoundError, ValidationError } from '../plugins/errorHandler';
import type { AuthenticatedRequest } from '../types';

// Validation schemas
const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  project_id: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  secret: z.string().optional(),
  active: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const ListWebhooksQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  event_type: z.string().optional(),
  active: z.enum(['true', 'false']).optional(),
});

const DeliveryHistoryQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default('20'),
  offset: z.string().regex(/^\d+$/).optional().default('0'),
  status: z.enum(['pending', 'delivering', 'success', 'failed', 'retrying']).optional(),
});

// Route handlers
const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // List webhook subscriptions
  fastify.get('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const query = ListWebhooksQuerySchema.parse(request.query);
    const userId = request.user?.id || 'system';

    const filters: { project_id?: string; event_type?: string; active?: boolean } = {};
    if (query.project_id) filters.project_id = query.project_id;
    if (query.event_type) filters.event_type = query.event_type;
    if (query.active !== undefined) filters.active = query.active === 'true';

    const subscriptions = await webhookService.listSubscriptions(filters);

    return {
      data: subscriptions.map((sub) => ({
        ...sub,
        secret: undefined, // Never return the secret
      })),
      meta: {
        total: subscriptions.length,
        filters,
      },
    };
  });

  // Create webhook subscription
  fastify.post('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const body = CreateWebhookSchema.parse(request.body);
    const userId = request.user?.id || 'system';

    const subscription = await webhookService.createSubscription({
      ...body,
      created_by: userId,
    });

    reply.status(201);
    return {
      data: {
        ...subscription,
        secret: undefined, // Never return the secret
      },
    };
  });

  // Get webhook subscription by ID
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const subscription = await webhookService.getSubscription(id);
    if (!subscription) {
      throw new NotFoundError('Webhook subscription', id);
    }

    return {
      data: {
        ...subscription,
        secret: undefined,
      },
    };
  });

  // Update webhook subscription
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = UpdateWebhookSchema.parse(request.body);

    const subscription = await webhookService.getSubscription(id);
    if (!subscription) {
      throw new NotFoundError('Webhook subscription', id);
    }

    const updated = await webhookService.updateSubscription(id, body);

    return {
      data: {
        ...updated,
        secret: undefined,
      },
    };
  });

  // Delete webhook subscription
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const subscription = await webhookService.getSubscription(id);
    if (!subscription) {
      throw new NotFoundError('Webhook subscription', id);
    }

    await webhookService.deleteSubscription(id);

    reply.status(204).send();
  });

  // Toggle subscription active status
  fastify.post('/:id/toggle', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { active: boolean };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { active } = request.body;

    const subscription = await webhookService.getSubscription(id);
    if (!subscription) {
      throw new NotFoundError('Webhook subscription', id);
    }

    const updated = await webhookService.toggleSubscription(id, active);

    return {
      data: {
        ...updated,
        secret: undefined,
      },
    };
  });

  // Get delivery history for a subscription
  fastify.get('/:id/deliveries', async (
    request: FastifyRequest<{
      Params: { id: string };
      Querystring: {
        limit?: string;
        offset?: string;
        status?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const query = DeliveryHistoryQuerySchema.parse(request.query);

    const subscription = await webhookService.getSubscription(id);
    if (!subscription) {
      throw new NotFoundError('Webhook subscription', id);
    }

    const history = await webhookService.getDeliveryHistory(id, {
      limit: parseInt(query.limit, 10),
      offset: parseInt(query.offset, 10),
      status: query.status,
    });

    return {
      data: history.deliveries,
      meta: {
        total: history.total,
        limit: parseInt(query.limit, 10),
        offset: parseInt(query.offset, 10),
      },
    };
  });

  // Get specific delivery
  fastify.get('/deliveries/:deliveryId', async (
    request: FastifyRequest<{ Params: { deliveryId: string } }>,
    reply: FastifyReply
  ) => {
    const { deliveryId } = request.params;

    const delivery = await webhookService.getDelivery(deliveryId);
    if (!delivery) {
      throw new NotFoundError('Webhook delivery', deliveryId);
    }

    return { data: delivery };
  });

  // Retry a failed delivery
  fastify.post('/deliveries/:deliveryId/retry', async (
    request: FastifyRequest<{ Params: { deliveryId: string } }>,
    reply: FastifyReply
  ) => {
    const { deliveryId } = request.params;

    const delivery = await webhookService.getDelivery(deliveryId);
    if (!delivery) {
      throw new NotFoundError('Webhook delivery', deliveryId);
    }

    if (delivery.status === 'success') {
      throw new ValidationError('Delivery already successful', { delivery_id: deliveryId });
    }

    await webhookService.retryDelivery(deliveryId);

    return {
      data: { message: 'Delivery retry initiated', delivery_id: deliveryId },
    };
  });

  // Get webhook statistics
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = request.query?.project_id as string | undefined;

    const stats = await webhookService.getStatistics(projectId);

    return { data: stats };
  });
};

export default webhookRoutes;
