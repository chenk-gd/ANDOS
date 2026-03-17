/**
 * WebhookService - AI-Native DevOps Platform
 * Manages webhook subscriptions and event delivery
 *
 * V1.5: Webhook system for event subscriptions and delivery
 */

import crypto from 'crypto';
import { db, withTransaction } from '../db/connection';

// Webhook subscription types
export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  project_id?: string;
  metadata?: Record<string, any>;
  last_delivery?: Date;
  last_status?: 'success' | 'failed';
  failure_count: number;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: string;
  event_id: string;
  payload: Record<string, any>;
  status: 'pending' | 'delivering' | 'success' | 'failed' | 'retrying';
  attempts: number;
  response_status?: number;
  response_body?: string;
  error_message?: string;
  created_at: Date;
  delivered_at?: Date;
  next_retry_at?: Date;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  secret?: string;
  project_id?: string;
  metadata?: Record<string, any>;
  created_by: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  secret?: string;
  active?: boolean;
  metadata?: Record<string, any>;
}

// Webhook payload structure
export interface WebhookPayload {
  event_id: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, any>;
  signature?: string;
}

// Delivery result
interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
}

export class WebhookService {
  private maxRetries = 5;
  private retryDelays = [5, 15, 60, 300, 900]; // seconds: 5s, 15s, 1m, 5m, 15m

  constructor() {
    // Initialize if needed
  }

  // ==================== Subscription Management ====================

  /**
   * Create a new webhook subscription
   */
  async createSubscription(input: CreateWebhookInput): Promise<WebhookSubscription> {
    const id = crypto.randomUUID();
    const secret = input.secret || this.generateSecret();
    const now = new Date();

    const [subscription] = await db('webhook_subscriptions')
      .insert({
        id,
        url: input.url,
        events: input.events,
        secret,
        active: true,
        created_at: now,
        updated_at: now,
        created_by: input.created_by,
        project_id: input.project_id,
        metadata: input.metadata || {},
        failure_count: 0,
      })
      .returning('*');

    return subscription;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    const subscription = await db('webhook_subscriptions').where({ id }).first();
    return subscription || null;
  }

  /**
   * List subscriptions with filters
   */
  async listSubscriptions(filters: {
    project_id?: string;
    event_type?: string;
    active?: boolean;
  } = {}): Promise<WebhookSubscription[]> {
    let query = db('webhook_subscriptions');

    if (filters.project_id) {
      query = query.where({ project_id: filters.project_id });
    }

    if (filters.event_type) {
      query = query.whereRaw('? = ANY(events)', [filters.event_type]);
    }

    if (filters.active !== undefined) {
      query = query.where({ active: filters.active });
    }

    return await query.orderBy('created_at', 'desc');
  }

  /**
   * Update subscription
   */
  async updateSubscription(id: string, input: UpdateWebhookInput): Promise<WebhookSubscription> {
    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };

    if (input.url !== undefined) updateData.url = input.url;
    if (input.events !== undefined) updateData.events = input.events;
    if (input.secret !== undefined) updateData.secret = input.secret;
    if (input.active !== undefined) updateData.active = input.active;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    const [updated] = await db('webhook_subscriptions')
      .where({ id })
      .update(updateData)
      .returning('*');

    return updated;
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(id: string): Promise<void> {
    await withTransaction(async (trx) => {
      // Delete pending deliveries first
      await trx('webhook_deliveries').where({ subscription_id: id }).delete();
      // Delete subscription
      await trx('webhook_subscriptions').where({ id }).delete();
    });
  }

  /**
   * Activate/deactivate subscription
   */
  async toggleSubscription(id: string, active: boolean): Promise<WebhookSubscription> {
    const [updated] = await db('webhook_subscriptions')
      .where({ id })
      .update({
        active,
        updated_at: new Date(),
        failure_count: active ? 0 : undefined, // Reset failure count on activation
      })
      .returning('*');

    return updated;
  }

  // ==================== Event Delivery ====================

  /**
   * Trigger event delivery to all matching subscriptions
   */
  async triggerEvent(
    eventType: string,
    payload: Record<string, any>,
    options?: {
      eventId?: string;
      projectId?: string;
      delayDelivery?: boolean;
    }
  ): Promise<{ deliveriesCreated: number; subscriptionsMatched: number }> {
    const eventId = options?.eventId || crypto.randomUUID();
    const now = new Date();

    // Find matching subscriptions
    const subscriptions = await this.findMatchingSubscriptions(eventType, options?.projectId);

    if (subscriptions.length === 0) {
      return { deliveriesCreated: 0, subscriptionsMatched: 0 };
    }

    // Create delivery records
    const deliveries: Omit<WebhookDelivery, 'id'>[] = subscriptions.map((sub) => ({
      subscription_id: sub.id,
      event_type: eventType,
      event_id: eventId,
      payload,
      status: options?.delayDelivery ? 'pending' : 'delivering',
      attempts: 0,
      created_at: now,
      next_retry_at: options?.delayDelivery ? undefined : now,
    }));

    await db('webhook_deliveries').insert(deliveries);

    // If not delayed, trigger immediate delivery
    if (!options?.delayDelivery) {
      // Fire and forget - actual delivery happens asynchronously
      this.processDeliveries();
    }

    return {
      deliveriesCreated: deliveries.length,
      subscriptionsMatched: subscriptions.length,
    };
  }

  /**
   * Process pending deliveries
   */
  async processDeliveries(): Promise<void> {
    // Get pending deliveries that are ready for retry
    const pendingDeliveries = await db('webhook_deliveries')
      .whereIn('status', ['pending', 'delivering', 'retrying'])
      .where((builder) => {
        builder.whereNull('next_retry_at').orWhere('next_retry_at', '<=', new Date());
      })
      .limit(100);

    // Process in parallel with concurrency limit
    const concurrencyLimit = 10;
    for (let i = 0; i < pendingDeliveries.length; i += concurrencyLimit) {
      const batch = pendingDeliveries.slice(i, i + concurrencyLimit);
      await Promise.all(batch.map((delivery) => this.processDelivery(delivery.id)));
    }
  }

  /**
   * Process a single delivery
   */
  async processDelivery(deliveryId: string): Promise<void> {
    const delivery = await db('webhook_deliveries').where({ id: deliveryId }).first();
    if (!delivery) return;

    const subscription = await this.getSubscription(delivery.subscription_id);
    if (!subscription || !subscription.active) {
      await this.updateDeliveryStatus(deliveryId, 'failed', { error: 'Subscription inactive or deleted' });
      return;
    }

    // Build payload
    const payload: WebhookPayload = {
      event_id: delivery.event_id,
      event_type: delivery.event_type,
      timestamp: new Date().toISOString(),
      payload: delivery.payload,
    };

    // Sign payload
    payload.signature = this.signPayload(payload.payload, subscription.secret);

    // Attempt delivery
    const result = await this.attemptDelivery(subscription.url, payload);

    if (result.success) {
      await this.handleDeliverySuccess(deliveryId, result);
    } else {
      await this.handleDeliveryFailure(deliveryId, delivery, result);
    }
  }

  /**
   * Retry a failed delivery
   */
  async retryDelivery(deliveryId: string): Promise<void> {
    const delivery = await db('webhook_deliveries').where({ id: deliveryId }).first();
    if (!delivery || delivery.status === 'success') {
      throw new Error('Delivery not found or already successful');
    }

    // Update status to retrying
    await db('webhook_deliveries')
      .where({ id: deliveryId })
      .update({
        status: 'retrying',
        next_retry_at: new Date(),
      });

    // Trigger delivery
    await this.processDelivery(deliveryId);
  }

  // ==================== Delivery History ====================

  /**
   * Get delivery history for a subscription
   */
  async getDeliveryHistory(
    subscriptionId: string,
    options?: { limit?: number; offset?: number; status?: string }
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    let query = db('webhook_deliveries').where({ subscription_id: subscriptionId });

    if (options?.status) {
      query = query.where({ status: options.status });
    }

    const total = await query.count('id as count').first();

    query = query.orderBy('created_at', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const deliveries = await query;

    return {
      deliveries,
      total: parseInt(total?.count as string, 10) || 0,
    };
  }

  /**
   * Get delivery by ID
   */
  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    const delivery = await db('webhook_deliveries').where({ id }).first();
    return delivery || null;
  }

  // ==================== Statistics ====================

  /**
   * Get webhook statistics
   */
  async getStatistics(projectId?: string): Promise<{
    subscriptions: { total: number; active: number; inactive: number };
    deliveries: { total: number; success: number; failed: number; pending: number };
    byEventType: Record<string, { deliveries: number; success: number }>;
  }> {
    let subQuery = db('webhook_subscriptions');
    if (projectId) {
      subQuery = subQuery.where({ project_id: projectId });
    }

    const [totalSubs, activeSubs] = await Promise.all([
      subQuery.count('id as count').first(),
      subQuery.where({ active: true }).count('id as count').first(),
    ]);

    let deliveryQuery = db('webhook_deliveries');
    if (projectId) {
      deliveryQuery = deliveryQuery.whereIn(
        'subscription_id',
        db('webhook_subscriptions').where({ project_id: projectId }).select('id')
      );
    }

    const [totalDeliveries, successDeliveries, failedDeliveries, pendingDeliveries] = await Promise.all([
      deliveryQuery.count('id as count').first(),
      deliveryQuery.where({ status: 'success' }).count('id as count').first(),
      deliveryQuery.where({ status: 'failed' }).count('id as count').first(),
      deliveryQuery.whereIn('status', ['pending', 'delivering', 'retrying']).count('id as count').first(),
    ]);

    // Group by event type
    const byEventType: Record<string, { deliveries: number; success: number }> = {};
    const eventStats = await deliveryQuery
      .select('event_type')
      .count('id as deliveries')
      .sum(db.raw("CASE WHEN status = 'success' THEN 1 ELSE 0 END"))
      .groupBy('event_type');

    for (const stat of eventStats) {
      byEventType[stat.event_type] = {
        deliveries: parseInt(stat.deliveries, 10),
        success: parseInt(stat.sum, 10),
      };
    }

    return {
      subscriptions: {
        total: parseInt(totalSubs?.count as string, 10) || 0,
        active: parseInt(activeSubs?.count as string, 10) || 0,
        inactive: parseInt(totalSubs?.count as string, 10) - parseInt(activeSubs?.count as string, 10) || 0,
      },
      deliveries: {
        total: parseInt(totalDeliveries?.count as string, 10) || 0,
        success: parseInt(successDeliveries?.count as string, 10) || 0,
        failed: parseInt(failedDeliveries?.count as string, 10) || 0,
        pending: parseInt(pendingDeliveries?.count as string, 10) || 0,
      },
      byEventType,
    };
  }

  // ==================== Private Helpers ====================

  private async findMatchingSubscriptions(
    eventType: string,
    projectId?: string
  ): Promise<WebhookSubscription[]> {
    let query = db('webhook_subscriptions')
      .where({ active: true })
      .whereRaw('? = ANY(events)', [eventType]);

    if (projectId) {
      query = query.where((builder) => {
        builder.where({ project_id: projectId }).orWhereNull('project_id');
      });
    }

    return await query;
  }

  private async attemptDelivery(url: string, payload: WebhookPayload): Promise<DeliveryResult> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-ID': payload.event_id,
          'X-Event-Type': payload.event_type,
          'X-Signature': payload.signature || '',
          'User-Agent': 'ANDOS-Webhook/1.0',
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await response.text();

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          responseBody,
        };
      } else {
        return {
          success: false,
          statusCode: response.status,
          responseBody,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async handleDeliverySuccess(
    deliveryId: string,
    result: DeliveryResult
  ): Promise<void> {
    await db('webhook_deliveries')
      .where({ id: deliveryId })
      .update({
        status: 'success',
        attempts: db.raw('attempts + 1'),
        response_status: result.statusCode,
        response_body: result.responseBody,
        delivered_at: new Date(),
        next_retry_at: null,
      });

    // Update subscription last delivery info
    const delivery = await db('webhook_deliveries').where({ id: deliveryId }).first();
    if (delivery) {
      await db('webhook_subscriptions')
        .where({ id: delivery.subscription_id })
        .update({
          last_delivery: new Date(),
          last_status: 'success',
          failure_count: 0,
        });
    }
  }

  private async handleDeliveryFailure(
    deliveryId: string,
    delivery: WebhookDelivery,
    result: DeliveryResult
  ): Promise<void> {
    const attempts = delivery.attempts + 1;
    const shouldRetry = attempts < this.maxRetries;

    const updateData: Record<string, any> = {
      attempts,
      response_status: result.statusCode,
      error_message: result.error,
    };

    if (shouldRetry) {
      const delaySeconds = this.retryDelays[Math.min(attempts - 1, this.retryDelays.length - 1)];
      const nextRetry = new Date();
      nextRetry.setSeconds(nextRetry.getSeconds() + delaySeconds);

      updateData.status = 'retrying';
      updateData.next_retry_at = nextRetry;
    } else {
      updateData.status = 'failed';
      updateData.next_retry_at = null;
    }

    await db('webhook_deliveries').where({ id: deliveryId }).update(updateData);

    // Update subscription failure count
    await db('webhook_subscriptions')
      .where({ id: delivery.subscription_id })
      .increment('failure_count', 1)
      .update({
        last_status: 'failed',
      });

    // Auto-disable subscription after too many failures
    const subscription = await this.getSubscription(delivery.subscription_id);
    if (subscription && subscription.failure_count >= 10) {
      await db('webhook_subscriptions')
        .where({ id: delivery.subscription_id })
        .update({ active: false });
    }
  }

  private async updateDeliveryStatus(
    deliveryId: string,
    status: string,
    options?: { error?: string }
  ): Promise<void> {
    await db('webhook_deliveries').where({ id: deliveryId }).update({
      status,
      error_message: options?.error,
    });
  }

  private signPayload(payload: Record<string, any>, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Export singleton instance
export const webhookService = new WebhookService();
