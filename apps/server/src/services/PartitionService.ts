/**
 * Partition Service - AI-Native DevOps Platform
 * Manages PostgreSQL table partitioning for time-series data
 *
 * P0: Automatic partition creation for agent_executions and platform_events
 */

import { db } from '../db/connection';

export interface PartitionInfo {
  tableName: string;
  partitionName: string;
  startDate: Date;
  endDate: Date;
  rowCount?: number;
  size?: string;
}

export class PartitionService {
  /**
   * Create partitions for next month
   * Should be run by a scheduled job (e.g., cron) at the end of each month
   */
  async createNextMonthPartitions(): Promise<{
    agentExecutions: string | null;
    platformEvents: string | null;
  }> {
    const result = await db.raw('SELECT create_next_month_partitions()');

    // Get the created partition names
    const nextMonth = this.getNextMonthDates();
    const yearMonth = `${nextMonth.year}_${nextMonth.month}`;

    return {
      agentExecutions: `agent_execs_${yearMonth}`,
      platformEvents: `platform_events_${yearMonth}`,
    };
  }

  /**
   * Create partition for a specific month
   */
  async createPartition(
    tableName: 'agent_executions' | 'platform_events',
    year: number,
    month: number
  ): Promise<string> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const yearStr = year.toString();
    const monthStr = month.toString().padStart(2, '0');

    const prefix = tableName === 'agent_executions' ? 'agent_execs' : 'platform_events';
    const partitionName = `${prefix}_${yearStr}_${monthStr}`;

    // Check if partition already exists
    const exists = await this.partitionExists(partitionName);
    if (exists) {
      return partitionName;
    }

    // Create partition
    await db.raw(
      `CREATE TABLE IF NOT EXISTS ?? PARTITION OF ?? FOR VALUES FROM (?) TO (?)`,
      [partitionName, tableName, startDate, endDate]
    );

    return partitionName;
  }

  /**
   * List all partitions for a table
   */
  async listPartitions(tableName: string): Promise<PartitionInfo[]> {
    const query = `
      SELECT
        parent.relname AS table_name,
        child.relname AS partition_name,
        pg_get_expr(child.relpartbound, child.oid) AS partition_bounds
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      WHERE parent.relname = ?
      ORDER BY child.relname
    `;

    const partitions = await db.raw(query, [tableName]);

    return partitions.rows.map((row: any) => {
      const bounds = this.parsePartitionBounds(row.partition_bounds);
      return {
        tableName: row.table_name,
        partitionName: row.partition_name,
        startDate: bounds.start,
        endDate: bounds.end,
      };
    });
  }

  /**
   * Get partition statistics
   */
  async getPartitionStats(partitionName: string): Promise<{
    rowCount: number;
    size: string;
    sizeBytes: number;
  }> {
    const countResult = await db.raw(
      `SELECT COUNT(*) as count FROM ??`,
      [partitionName]
    );

    const sizeResult = await db.raw(
      `SELECT pg_size_pretty(pg_total_relation_size(?)) as size,
              pg_total_relation_size(?) as size_bytes`,
      [partitionName, partitionName]
    );

    return {
      rowCount: parseInt(countResult.rows[0].count, 10),
      size: sizeResult.rows[0].size,
      sizeBytes: parseInt(sizeResult.rows[0].size_bytes, 10),
    };
  }

  /**
   * Detach old partition (for archiving)
   */
  async detachPartition(
    tableName: 'agent_executions' | 'platform_events',
    partitionName: string
  ): Promise<void> {
    await db.raw(`ALTER TABLE ?? DETACH PARTITION ??`, [tableName, partitionName]);
  }

  /**
   * Attach existing table as partition
   */
  async attachPartition(
    tableName: 'agent_executions' | 'platform_events',
    partitionName: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    await db.raw(
      `ALTER TABLE ?? ATTACH PARTITION ?? FOR VALUES FROM (?) TO (?)`,
      [tableName, partitionName, startDate, endDate]
    );
  }

  /**
   * Drop old partition (use with caution - data will be lost)
   */
  async dropPartition(partitionName: string): Promise<void> {
    await db.raw(`DROP TABLE IF EXISTS ??`, [partitionName]);
  }

  /**
   * Check if partition exists
   */
  async partitionExists(partitionName: string): Promise<boolean> {
    const result = await db.raw(
      `SELECT 1 FROM pg_tables WHERE tablename = ?`,
      [partitionName]
    );
    return result.rows.length > 0;
  }

  /**
   * Get partition for a specific date
   */
  getPartitionForDate(
    tableName: 'agent_executions' | 'platform_events',
    date: Date
  ): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    const prefix = tableName === 'agent_executions' ? 'agent_execs' : 'platform_events';
    return `${prefix}_${year}_${month}`;
  }

  /**
   * Archive old partitions (detach but don't drop)
   */
  async archiveOldPartitions(
    tableName: 'agent_executions' | 'platform_events',
    monthsToKeep: number
  ): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);

    const partitions = await this.listPartitions(tableName);
    const archived: string[] = [];

    for (const partition of partitions) {
      if (partition.endDate < cutoffDate) {
        await this.detachPartition(tableName, partition.partitionName);
        archived.push(partition.partitionName);
      }
    }

    return archived;
  }

  /**
   * Create partitions for multiple months ahead
   */
  async createPartitionsAhead(
    tableName: 'agent_executions' | 'platform_events',
    monthsAhead: number
  ): Promise<string[]> {
    const now = new Date();
    const created: string[] = [];

    for (let i = 0; i < monthsAhead; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const partitionName = await this.createPartition(
        tableName,
        date.getFullYear(),
        date.getMonth() + 1
      );
      created.push(partitionName);
    }

    return created;
  }

  // ==================== Private Helpers ====================

  private getNextMonthDates(): { year: string; month: string } {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      year: nextMonth.getFullYear().toString(),
      month: (nextMonth.getMonth() + 1).toString().padStart(2, '0'),
    };
  }

  private parsePartitionBounds(bounds: string): { start: Date; end: Date } {
    // Parse format: FOR VALUES FROM ('2026-03-01') TO ('2026-04-01')
    const match = bounds.match(/FROM \('([^']+)'\) TO \('([^']+)'\)/);
    if (!match) {
      return { start: new Date(), end: new Date() };
    }
    return {
      start: new Date(match[1]),
      end: new Date(match[2]),
    };
  }
}

// Export singleton instance
export const partitionService = new PartitionService();
