/**
 * ProjectMemoryService - Agent Memory System v1.5
 * Manages project-level memory and learned patterns
 */

import { db } from '../db/connection';
import { ProjectMemory, SharedContext, LearnedPattern, PatternType } from '../types/memory';

// Error types
export class ProjectMemoryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ProjectMemoryError';
  }
}

export class PatternNotFoundError extends ProjectMemoryError {
  constructor(patternId: string) {
    super(`Pattern not found: ${patternId}`, 'PATTERN_NOT_FOUND');
  }
}

export class ProjectMemoryNotFoundError extends ProjectMemoryError {
  constructor(projectId: string) {
    super(`Project memory not found: ${projectId}`, 'PROJECT_MEMORY_NOT_FOUND');
  }
}

/**
 * Deep merge two objects
 * Merges source into target recursively
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(targetValue as Record<string, any>, sourceValue as Record<string, any>) as T[keyof T];
    } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      // For arrays, we concatenate and deduplicate
      result[key] = [...targetValue, ...sourceValue] as T[keyof T];
    } else {
      // For primitives or null, just use source value
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Default empty shared context
 */
function getDefaultSharedContext(): SharedContext {
  return {
    code_style_preferences: {
      naming_conventions: {},
      formatting_rules: {},
      language_specific: {},
    },
    api_patterns: [],
    common_errors: [],
    team_conventions: [],
    architecture_decisions: [],
  };
}

/**
 * Escape special LIKE pattern characters
 * Escapes %, _, and \ to prevent them from being interpreted as wildcards
 */
function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

interface ProjectMemoryRow {
  id: string;
  project_id: string;
  shared_context: any;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface LearnedPatternRow {
  id: string;
  project_id: string;
  type: PatternType;
  name: string;
  description?: string;
  pattern: any;
  frequency: number;
  confidence: number;
  last_observed_at: Date | string;
  created_at: Date | string;
}

export class ProjectMemoryService {
  /**
   * Get or create project memory
   */
  async getProjectMemory(projectId: string): Promise<ProjectMemory> {
    // Query existing project memory
    let row = await db('project_memories')
      .where({ project_id: projectId })
      .first() as ProjectMemoryRow | undefined;

    // If not found, create with empty shared_context
    if (!row) {
      const id = crypto.randomUUID();
      const now = new Date();
      const defaultContext = getDefaultSharedContext();

      [row] = await db('project_memories')
        .insert({
          id,
          project_id: projectId,
          shared_context: JSON.stringify(defaultContext),
          version: 1,
          created_at: now,
          updated_at: now,
        })
        .returning(['id', 'project_id', 'shared_context', 'version', 'created_at', 'updated_at']);
    }

    return this.rowToProjectMemory(row);
  }

  /**
   * Get project shared context
   */
  async getProjectContext(projectId: string): Promise<SharedContext> {
    const memory = await this.getProjectMemory(projectId);
    return memory.shared_context;
  }

  /**
   * Update project shared context
   */
  async updateProjectContext(
    projectId: string,
    context: Partial<SharedContext>
  ): Promise<void> {
    // Get or create project memory
    const memory = await this.getProjectMemory(projectId);

    // Deep merge new context with existing
    const mergedContext = deepMerge(memory.shared_context, context);

    // Increment version and update timestamp
    await db('project_memories')
      .where({ project_id: projectId })
      .update({
        shared_context: JSON.stringify(mergedContext),
        version: memory.version + 1,
        updated_at: new Date(),
      });
  }

  /**
   * Record a learned pattern
   */
  async recordPattern(
    projectId: string,
    pattern: Omit<LearnedPattern, 'id' | 'created_at'>
  ): Promise<LearnedPattern> {
    const now = new Date();

    // Check if similar pattern already exists (by name and type)
    const existingPattern = await db('learned_patterns')
      .where({
        project_id: projectId,
        type: pattern.type,
        name: pattern.name,
      })
      .first() as LearnedPatternRow | undefined;

    if (existingPattern) {
      // Increment frequency of existing pattern
      await db('learned_patterns')
        .where({ id: existingPattern.id })
        .update({
          frequency: existingPattern.frequency + 1,
          last_observed_at: now,
        });

      return this.rowToLearnedPattern({
        ...existingPattern,
        frequency: existingPattern.frequency + 1,
        last_observed_at: now,
      });
    }

    // Create new pattern
    const id = crypto.randomUUID();

    const [row] = await db('learned_patterns')
      .insert({
        id,
        project_id: projectId,
        type: pattern.type,
        name: pattern.name,
        description: pattern.description ?? null,
        pattern: JSON.stringify(pattern.pattern),
        frequency: pattern.frequency ?? 1,
        confidence: pattern.confidence,
        last_observed_at: pattern.last_observed_at ?? now,
        created_at: now,
      })
      .returning(['id', 'project_id', 'type', 'name', 'description', 'pattern', 'frequency', 'confidence', 'last_observed_at', 'created_at']);

    return this.rowToLearnedPattern(row);
  }

  /**
   * Query patterns by keywords (V1.5: no vector search, uses SQL ILIKE)
   */
  async queryPatterns(
    projectId: string,
    keywords: string[],
    options?: { limit?: number; type?: PatternType }
  ): Promise<LearnedPattern[]> {
    const limit = options?.limit ?? 10;

    // Build ILIKE conditions for keyword matching
    let query = db('learned_patterns')
      .where({ project_id: projectId });

    // Apply keyword filters using ILIKE (case-insensitive LIKE)
    if (keywords.length > 0) {
      query = query.andWhere((builder) => {
        for (const keyword of keywords) {
          const pattern = `%${escapeLikePattern(keyword)}%`;
          builder.orWhere('name', 'ilike', pattern);
          builder.orWhere('description', 'ilike', pattern);
          builder.orWhereRaw("pattern::text ILIKE ?", [pattern]);
        }
      });
    }

    // Filter by type if provided
    if (options?.type) {
      query = query.where({ type: options.type });
    }

    // Order by confidence DESC, frequency DESC
    const rows = await query
      .orderBy('confidence', 'desc')
      .orderBy('frequency', 'desc')
      .limit(limit) as LearnedPatternRow[];

    return rows.map(row => this.rowToLearnedPattern(row));
  }

  /**
   * Get pattern by ID
   */
  async getPattern(patternId: string): Promise<LearnedPattern | null> {
    const row = await db('learned_patterns')
      .where({ id: patternId })
      .first() as LearnedPatternRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToLearnedPattern(row);
  }

  /**
   * Increment pattern frequency
   */
  async incrementPatternFrequency(patternId: string): Promise<void> {
    const now = new Date();

    const result = await db('learned_patterns')
      .where({ id: patternId })
      .increment('frequency', 1)
      .update({ last_observed_at: now });

    if (result === 0) {
      throw new PatternNotFoundError(patternId);
    }
  }

  /**
   * Delete a pattern
   * @returns boolean indicating whether a pattern was actually deleted
   */
  async deletePattern(patternId: string): Promise<boolean> {
    const result = await db('learned_patterns')
      .where({ id: patternId })
      .del();
    return result > 0;
  }

  /**
   * Get all patterns for a project
   */
  async getProjectPatterns(projectId: string): Promise<LearnedPattern[]> {
    const rows = await db('learned_patterns')
      .where({ project_id: projectId })
      .orderBy('frequency', 'desc')
      .orderBy('confidence', 'desc') as LearnedPatternRow[];

    return rows.map(row => this.rowToLearnedPattern(row));
  }

  /**
   * Convert database row to ProjectMemory object
   */
  private rowToProjectMemory(row: ProjectMemoryRow): ProjectMemory {
    const sharedContext = typeof row.shared_context === 'string'
      ? JSON.parse(row.shared_context)
      : row.shared_context;

    return {
      id: row.id,
      project_id: row.project_id,
      shared_context: sharedContext,
      version: row.version,
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }

  /**
   * Convert database row to LearnedPattern object
   */
  private rowToLearnedPattern(row: LearnedPatternRow): LearnedPattern {
    const patternData = typeof row.pattern === 'string'
      ? JSON.parse(row.pattern)
      : row.pattern;

    return {
      id: row.id,
      project_id: row.project_id,
      type: row.type,
      name: row.name,
      description: row.description,
      pattern: patternData,
      frequency: row.frequency,
      confidence: row.confidence,
      last_observed_at: row.last_observed_at instanceof Date
        ? row.last_observed_at
        : new Date(row.last_observed_at),
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    };
  }
}

export const projectMemoryService = new ProjectMemoryService();
