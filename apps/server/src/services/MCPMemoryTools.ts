/**
 * MCPMemoryTools - Agent Memory System v1.5
 * MCP-compatible memory tools for Agents to interact with the memory system
 *
 * Implements:
 * - memory_remember: Store a new memory
 * - memory_forget: Remove a memory
 * - memory_search: Search memories by keywords (V1.5: keyword-based)
 */

import crypto from 'crypto';
import { MCPMemoryTool, MemoryLevel } from '../types/memory';
import { kvMemoryService } from './KVMemoryService';

export const MEMORY_TOOLS: MCPMemoryTool[] = [
  {
    name: 'memory_remember',
    description: 'Store a new memory at session, project, or organization level',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
        namespace: { type: 'string', default: 'default' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content', 'level'],
    },
  },
  {
    name: 'memory_forget',
    description: 'Remove a memory by key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
      },
      required: ['key', 'level'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search memories by keywords (V1.5: keyword-based, V3.0: semantic)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query/keywords' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
        limit: { type: 'number', default: 10 },
      },
      required: ['query', 'level'],
    },
  },
];

interface MemoryValue {
  content: string;
  tags: string[];
  createdAt: string;
  projectId?: string;
  sessionId?: string;
}

export class MCPMemoryTools {
  /**
   * Execute memory_remember tool
   * Store a new memory at session, project, or organization level
   */
  async remember(args: {
    content: string;
    level: 'session' | 'project' | 'organization';
    namespace?: string;
    tags?: string[];
    projectId?: string;
    sessionId?: string;
  }): Promise<{ key: string }> {
    const {
      content,
      level,
      namespace = 'default',
      tags = [],
      projectId,
      sessionId,
    } = args;

    // Generate a unique key for the memory
    const userKey = crypto.randomUUID();
    const fullKey = `${level}:${namespace}:${userKey}`;

    // Build the memory value
    const memoryValue: MemoryValue = {
      content,
      tags,
      createdAt: new Date().toISOString(),
      projectId,
      sessionId,
    };

    // Store using KVMemoryService with appropriate options
    await kvMemoryService.set(userKey, memoryValue, {
      namespace,
      level,
      projectId,
      sessionId,
    });

    // Return the full key format for later retrieval/deletion
    return { key: fullKey };
  }

  /**
   * Execute memory_forget tool
   * Remove a memory by key
   * Key format: "{level}:{namespace}:{userKey}" (as returned by remember)
   */
  async forget(args: {
    key: string;
    level: 'session' | 'project' | 'organization';
  }): Promise<{ success: boolean; error?: string }> {
    const { key, level } = args;

    // Parse the full key if it's in the expected format
    // Key format: "{level}:{namespace}:{userKey}"
    const parts = key.split(':');
    let deleteKey = key;

    if (parts.length >= 3) {
      const keyLevel = parts[0];
      // Verify level matches if key has the full format
      if (keyLevel !== level) {
        return { success: false, error: `Key level "${keyLevel}" does not match provided level "${level}"` };
      }
      // Use the full key for deletion
      deleteKey = key;
    }
    // If key doesn't have full format, use as-is (backward compatibility)

    try {
      await kvMemoryService.delete(deleteKey);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to delete memory: ${errorMessage}` };
    }
  }

  /**
   * Execute memory_search tool
   * Search memories by keywords (V1.5: keyword-based search)
   */
  async search(args: {
    query: string;
    level: 'session' | 'project' | 'organization';
    limit?: number;
    projectId?: string;
    sessionId?: string;
  }): Promise<Array<{ key: string; content: string; relevance: number }>> {
    const {
      query,
      level,
      limit = 10,
      projectId,
      sessionId,
    } = args;

    // Normalize query for case-insensitive search
    const normalizedQuery = query.toLowerCase();
    const queryTerms = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

    // Use getByNamespace with filters for proper metadata filtering
    // We need to search across all namespaces at the given level
    // For V1.5, we scan by level prefix and filter manually
    const allMemories: Array<{ key: string; value: any; project_id?: string | null; session_id?: string | null }> = [];

    // Scan all keys with the level prefix
    const prefix = `${level}:`;
    const scannedMemories = await kvMemoryService.scan(prefix);

    // For each memory, we need to check if it matches the filters
    // In a real implementation, we'd use a more efficient query
    // For now, we filter in-memory
    for (const memory of scannedMemories) {
      // Parse the full key to extract level, namespace, and user key
      const parts = memory.key.split(':');
      if (parts.length < 3) continue;

      const memLevel = parts[0];
      const memNamespace = parts[1];
      const userKey = parts.slice(2).join(':');

      // Only include if level matches
      if (memLevel !== level) continue;

      // For project-level memories, we need to check project_id
      // The scan doesn't return metadata, so we need to fetch it
      // In the mock, the value might contain this info, or we skip detailed filtering
      // For V1.5, we accept that exact project/session filtering may be limited

      // Store the metadata along with the value for filtering
      allMemories.push({
        key: userKey,
        value: memory.value,
        project_id: memory.value?.projectId || null,
        session_id: memory.value?.sessionId || null,
      });
    }

    // Filter and score results
    const results: Array<{ key: string; content: string; relevance: number }> = [];

    for (const memory of allMemories) {
      // Skip if projectId filter is specified and doesn't match
      if (projectId) {
        const memProjectId = memory.value?.projectId || memory.project_id;
        if (memProjectId !== projectId) {
          continue;
        }
      }

      // Skip if sessionId filter is specified and doesn't match
      if (sessionId) {
        const memSessionId = memory.value?.sessionId || memory.session_id;
        if (memSessionId !== sessionId) {
          continue;
        }
      }

      const memoryContent = memory.value?.content?.toLowerCase() || '';
      const memoryTags = memory.value?.tags || [];

      // Calculate relevance score (V1.5: simple keyword matching)
      let relevance = 0;
      let matchCount = 0;

      for (const term of queryTerms) {
        // Content match
        if (memoryContent.includes(term)) {
          matchCount++;
          // Exact match in content gets higher score
          if (memoryContent === term) {
            relevance += 1.0;
          } else if (memoryContent.startsWith(term + ' ') || memoryContent.endsWith(' ' + term)) {
            relevance += 0.8;
          } else {
            relevance += 0.5;
          }
        }

        // Tag match gets bonus
        if (memoryTags.some((tag: string) => tag.toLowerCase().includes(term))) {
          relevance += 0.3;
          matchCount++;
        }
      }

      // Normalize relevance based on query term coverage
      if (matchCount > 0) {
        relevance = relevance / queryTerms.length;
        // Cap at 1.0
        relevance = Math.min(relevance, 1.0);

        results.push({
          key: memory.key,
          content: memory.value.content,
          relevance,
        });
      }
    }

    // Sort by relevance (highest first) and limit results
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit);
  }

  /**
   * List available tools
   */
  listTools(): MCPMemoryTool[] {
    return MEMORY_TOOLS;
  }
}

// Export singleton instance
export const mcpMemoryTools = new MCPMemoryTools();
