/**
 * PartitionService Tests
 * Tests for PostgreSQL table partitioning management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { partitionService } from '../../../src/services/PartitionService';
import { db } from '../../../src/db/connection';
import { withTestTransaction } from '../../helpers/db';

describe('PartitionService', () => {
  describe('Partition Creation', () => {
    it('should create a partition for agent_executions', async () => {
      const partitionName = await partitionService.createPartition(
        'agent_executions',
        2026,
        6
      );

      expect(partitionName).toBe('agent_execs_2026_06');

      // Verify partition exists
      const exists = await partitionService.partitionExists(partitionName);
      expect(exists).toBe(true);
    });

    it('should create a partition for platform_events', async () => {
      const partitionName = await partitionService.createPartition(
        'platform_events',
        2026,
        6
      );

      expect(partitionName).toBe('platform_events_2026_06');

      const exists = await partitionService.partitionExists(partitionName);
      expect(exists).toBe(true);
    });

    it('should return existing partition without error', async () => {
      // Create first time
      await partitionService.createPartition('agent_executions', 2026, 7);

      // Create second time - should not throw
      const partitionName = await partitionService.createPartition(
        'agent_executions',
        2026,
        7
      );

      expect(partitionName).toBe('agent_execs_2026_07');
    });
  });

  describe('Partition Listing', () => {
    it('should list partitions for agent_executions', async () => {
      const partitions = await partitionService.listPartitions('agent_executions');

      expect(Array.isArray(partitions)).toBe(true);
      expect(partitions.length).toBeGreaterThan(0);

      // All should have correct table name
      partitions.forEach((p) => {
        expect(p.tableName).toBe('agent_executions');
        expect(p.partitionName).toMatch(/^agent_execs_\d{4}_\d{2}$/);
      });
    });

    it('should list partitions for platform_events', async () => {
      const partitions = await partitionService.listPartitions('platform_events');

      expect(Array.isArray(partitions)).toBe(true);
      expect(partitions.length).toBeGreaterThan(0);

      partitions.forEach((p) => {
        expect(p.tableName).toBe('platform_events');
        expect(p.partitionName).toMatch(/^platform_events_\d{4}_\d{2}$/);
      });
    });

    it('should have valid date ranges for partitions', async () => {
      const partitions = await partitionService.listPartitions('agent_executions');

      partitions.forEach((p) => {
        expect(p.startDate).toBeInstanceOf(Date);
        expect(p.endDate).toBeInstanceOf(Date);
        expect(p.startDate.getTime()).toBeLessThan(p.endDate.getTime());
      });
    });
  });

  describe('Partition Statistics', () => {
    it('should get stats for a partition', async () => {
      // Get any existing partition
      const partitions = await partitionService.listPartitions('agent_executions');
      if (partitions.length === 0) {
        return; // Skip if no partitions
      }

      const stats = await partitionService.getPartitionStats(partitions[0].partitionName);

      expect(typeof stats.rowCount).toBe('number');
      expect(typeof stats.size).toBe('string');
      expect(typeof stats.sizeBytes).toBe('number');
      expect(stats.sizeBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Partition Name Generation', () => {
    it('should generate correct partition name for date', () => {
      const date = new Date(2026, 2, 15); // March 15, 2026

      const agentPartition = partitionService.getPartitionForDate('agent_executions', date);
      expect(agentPartition).toBe('agent_execs_2026_03');

      const eventPartition = partitionService.getPartitionForDate('platform_events', date);
      expect(eventPartition).toBe('platform_events_2026_03');
    });

    it('should handle year boundary correctly', () => {
      const date = new Date(2026, 11, 31); // December 31, 2026

      const partition = partitionService.getPartitionForDate('agent_executions', date);
      expect(partition).toBe('agent_execs_2026_12');
    });

    it('should handle January correctly', () => {
      const date = new Date(2026, 0, 1); // January 1, 2026

      const partition = partitionService.getPartitionForDate('agent_executions', date);
      expect(partition).toBe('agent_execs_2026_01');
    });
  });

  describe('Partition Existence Check', () => {
    it('should return true for existing partition', async () => {
      const partitions = await partitionService.listPartitions('agent_executions');
      if (partitions.length > 0) {
        const exists = await partitionService.partitionExists(partitions[0].partitionName);
        expect(exists).toBe(true);
      }
    });

    it('should return false for non-existing partition', async () => {
      const exists = await partitionService.partitionExists('non_existent_partition_9999_99');
      expect(exists).toBe(false);
    });
  });

  describe('Create Partitions Ahead', () => {
    it('should create multiple partitions ahead', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      // Create partitions for next 3 months
      const created = await partitionService.createPartitionsAhead('agent_executions', 3);

      expect(created.length).toBe(3);
      created.forEach((name) => {
        expect(name).toMatch(/^agent_execs_\d{4}_\d{2}$/);
      });

      // Verify they exist
      for (const name of created) {
        const exists = await partitionService.partitionExists(name);
        expect(exists).toBe(true);
      }
    });
  });

  describe('Partition Detach and Attach', () => {
    it('should detach and reattach a partition', async () => {
      // Create a test partition
      const testYear = 2025;
      const testMonth = 1;
      const partitionName = await partitionService.createPartition(
        'agent_executions',
        testYear,
        testMonth
      );

      // Detach
      await partitionService.detachPartition('agent_executions', partitionName);

      // Verify it's no longer a partition (but table still exists)
      const partitions = await partitionService.listPartitions('agent_executions');
      const detached = partitions.find((p) => p.partitionName === partitionName);
      expect(detached).toBeUndefined();

      // Reattach
      const startDate = new Date(testYear, testMonth - 1, 1);
      const endDate = new Date(testYear, testMonth, 1);
      await partitionService.attachPartition(
        'agent_executions',
        partitionName,
        startDate,
        endDate
      );

      // Verify it's back
      const partitionsAfter = await partitionService.listPartitions('agent_executions');
      const reattached = partitionsAfter.find((p) => p.partitionName === partitionName);
      expect(reattached).toBeDefined();
    });
  });

  describe('Archive Old Partitions', () => {
    it('should archive old partitions', async () => {
      // Create a very old partition for testing
      const oldPartition = await partitionService.createPartition(
        'agent_executions',
        2020,
        1
      );

      // Archive partitions older than 1 month
      const archived = await partitionService.archiveOldPartitions('agent_executions', 1);

      // The 2020 partition should be archived
      expect(archived.includes(oldPartition)).toBe(true);

      // Verify it's detached
      const partitions = await partitionService.listPartitions('agent_executions');
      const found = partitions.find((p) => p.partitionName === oldPartition);
      expect(found).toBeUndefined();

      // Cleanup: drop the detached table
      await partitionService.dropPartition(oldPartition);
    });
  });

  describe('Create Next Month Partitions', () => {
    it('should create next month partitions', async () => {
      const result = await partitionService.createNextMonthPartitions();

      expect(result.agentExecutions).toMatch(/^agent_execs_\d{4}_\d{2}$/);
      expect(result.platformEvents).toMatch(/^platform_events_\d{4}_\d{2}$/);

      // Verify they exist
      const agentExists = await partitionService.partitionExists(result.agentExecutions);
      const eventExists = await partitionService.partitionExists(result.platformEvents);

      expect(agentExists).toBe(true);
      expect(eventExists).toBe(true);
    });
  });
});
