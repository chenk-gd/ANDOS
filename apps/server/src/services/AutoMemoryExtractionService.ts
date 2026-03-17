/**
 * AutoMemoryExtractionService - Agent Memory System v1.5
 * Automatically extracts important information from agent sessions
 * and stores them as memory candidates for user review.
 */

import { db } from '../db/connection';
import type { MemoryCandidate, MemoryCandidateType, CandidateStatus, Turn } from '../types/memory';

export interface ExtractionPolicy {
  tokenThresholds: { first: number; subsequent: number };
  toolCallInterval: number;
  timeInterval: number;
  events: string[];
}

export const DEFAULT_EXTRACTION_POLICY: ExtractionPolicy = {
  tokenThresholds: { first: 10000, subsequent: 5000 },
  toolCallInterval: 3,
  timeInterval: 5 * 60 * 1000, // 5 minutes
  events: ['asset_published', 'dirty_resolved', 'error_occurred', 'decision_made'],
};

export class AutoMemoryExtractionService {
  private policy: ExtractionPolicy;

  constructor(policy: ExtractionPolicy = DEFAULT_EXTRACTION_POLICY) {
    this.policy = policy;
  }

  /**
   * Extract memories in background (non-blocking)
   */
  async extractInBackground(sessionId: string, turns: Turn[]): Promise<void> {
    try {
      // Identify candidates from session turns
      const candidates = await this.identifyCandidates(sessionId, turns);

      // Store candidates to pool
      if (candidates.length > 0) {
        await this.storeCandidates(candidates);
      }
    } catch (error) {
      // Background extraction should not throw - log and continue
      console.error('AutoMemoryExtractionService: Extraction failed:', error);
    }
  }

  /**
   * Identify memory candidates from session
   * Uses simple keyword-based extraction for V1.5
   */
  async identifyCandidates(
    sessionId: string,
    turns: Turn[]
  ): Promise<MemoryCandidate[]> {
    const candidates: MemoryCandidate[] = [];
    const now = new Date();

    // Combine all turn content for analysis
    const allContent = turns
      .map((turn) => turn.content)
      .join('\n')
      .toLowerCase();

    // Extract decisions
    const decisionPatterns = [
      /decision:\s*(.+?)(?:\.|\n|$)/gi,
      /we decided\s+(?:to\s+)?(.+?)(?:\.|\n|$)/gi,
      /will use\s+(.+?)(?:\.|\n|$)/gi,
      /agreed\s+(?:to\s+)?(.+?)(?:\.|\n|$)/gi,
    ];

    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(allContent)) !== null) {
        const content = match[1].trim();
        if (content.length > 10) {
          candidates.push({
            id: crypto.randomUUID(),
            type: 'decision',
            content: `Decision: ${content}`,
            confidence: this.calculateConfidence(content, 'decision'),
            source: sessionId,
            status: 'pending',
            created_at: now,
          });
        }
      }
    }

    // Extract patterns
    const patternPatterns = [
      /pattern:\s*(.+?)(?:\.|\n|$)/gi,
      /best practice:\s*(.+?)(?:\.|\n|$)/gi,
      /convention:\s*(.+?)(?:\.|\n|$)/gi,
      /should use\s+(.+?)(?:\.|\n|$)/gi,
    ];

    for (const pattern of patternPatterns) {
      let match;
      while ((match = pattern.exec(allContent)) !== null) {
        const content = match[1].trim();
        if (content.length > 10) {
          candidates.push({
            id: crypto.randomUUID(),
            type: 'pattern',
            content: `Pattern: ${content}`,
            confidence: this.calculateConfidence(content, 'pattern'),
            source: sessionId,
            status: 'pending',
            created_at: now,
          });
        }
      }
    }

    // Extract errors
    const errorPatterns = [
      /error:\s*(.+?)(?:\.|\n|$)/gi,
      /exception:\s*(.+?)(?:\.|\n|$)/gi,
      /failed\s+(?:to\s+)?(.+?)(?:\.|\n|$)/gi,
      /(connection\s+(?:refused|timeout|error))/gi,
    ];

    for (const pattern of errorPatterns) {
      let match;
      while ((match = pattern.exec(allContent)) !== null) {
        const content = match[1].trim();
        if (content.length > 5) {
          candidates.push({
            id: crypto.randomUUID(),
            type: 'error',
            content: `Error: ${content}`,
            confidence: this.calculateConfidence(content, 'error'),
            source: sessionId,
            status: 'pending',
            created_at: now,
          });
        }
      }
    }

    // Extract insights
    const insightPatterns = [
      /insight:\s*(.+?)(?:\.|\n|$)/gi,
      /key (?:finding|point):\s*(.+?)(?:\.|\n|$)/gi,
      /important:\s*(.+?)(?:\.|\n|$)/gi,
      /note:\s*(.+?)(?:\.|\n|$)/gi,
    ];

    for (const pattern of insightPatterns) {
      let match;
      while ((match = pattern.exec(allContent)) !== null) {
        const content = match[1].trim();
        if (content.length > 10) {
          candidates.push({
            id: crypto.randomUUID(),
            type: 'insight',
            content: `Insight: ${content}`,
            confidence: this.calculateConfidence(content, 'insight'),
            source: sessionId,
            status: 'pending',
            created_at: now,
          });
        }
      }
    }

    // Deduplicate candidates by content similarity
    const uniqueCandidates = this.deduplicateCandidates(candidates);

    return uniqueCandidates;
  }

  /**
   * Calculate confidence score based on content characteristics
   */
  private calculateConfidence(content: string, type: MemoryCandidateType): number {
    let confidence = 0.5; // Base confidence

    // Length factor - longer content gets higher confidence
    if (content.length > 50) confidence += 0.1;
    if (content.length > 100) confidence += 0.1;

    // Specificity factors
    if (/\b(use|using|choose|chose|decide|decided)\b/i.test(content)) {
      confidence += 0.1;
    }
    if (/\b(because|since|as|reason)\b/i.test(content)) {
      confidence += 0.1;
    }
    if (/\b(never|always|must|should|avoid)\b/i.test(content)) {
      confidence += 0.1;
    }

    // Type-specific adjustments
    switch (type) {
      case 'decision':
        if (/\b(final|agreed|decided)\b/i.test(content)) confidence += 0.1;
        break;
      case 'pattern':
        if (/\b(pattern|practice|convention)\b/i.test(content)) confidence += 0.1;
        break;
      case 'error':
        if (/\b(error|exception|fail)\b/i.test(content)) confidence += 0.1;
        break;
      case 'insight':
        if (/\b(insight|finding|important)\b/i.test(content)) confidence += 0.1;
        break;
    }

    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }

  /**
   * Deduplicate candidates by content similarity
   */
  private deduplicateCandidates(candidates: MemoryCandidate[]): MemoryCandidate[] {
    const seen = new Set<string>();
    const unique: MemoryCandidate[] = [];

    for (const candidate of candidates) {
      // Normalize content for comparison
      const normalized = candidate.content
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Simple deduplication - skip if we've seen similar content
      let isDuplicate = false;
      for (const existing of seen) {
        if (this.contentSimilarity(normalized, existing) > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.add(normalized);
        unique.push(candidate);
      }
    }

    return unique;
  }

  /**
   * Calculate similarity between two content strings (0-1)
   */
  private contentSimilarity(a: string, b: string): number {
    const aWords = new Set(a.split(' '));
    const bWords = new Set(b.split(' '));

    const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);

    return intersection.size / union.size;
  }

  /**
   * Store candidates to pool
   */
  async storeCandidates(candidates: MemoryCandidate[]): Promise<void> {
    if (candidates.length === 0) {
      return;
    }

    // Prepare rows for database
    const rows = candidates.map((candidate) => ({
      id: candidate.id,
      type: candidate.type,
      content: candidate.content,
      confidence: candidate.confidence,
      source: candidate.source,
      status: candidate.status,
      user_feedback: candidate.user_feedback ?? null,
      created_at: candidate.created_at,
      project_id: candidate.project_id ?? null,
    }));

    // Insert all candidates
    await db('memory_candidates').insert(rows);
  }

  /**
   * Get pending candidates for user review
   */
  async getPendingCandidates(): Promise<MemoryCandidate[]> {
    const rows = await db('memory_candidates')
      .where({ status: 'pending' })
      .orderBy('confidence', 'desc');

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      confidence: row.confidence,
      source: row.source,
      status: row.status,
      user_feedback: row.user_feedback,
      created_at: row.created_at,
      project_id: row.project_id,
    }));
  }

  /**
   * Process user feedback on candidates
   */
  async processCandidateFeedback(
    candidateId: string,
    action: 'approve' | 'reject' | 'edit',
    editedContent?: string
  ): Promise<void> {
    let status: CandidateStatus;
    let content = editedContent;

    switch (action) {
      case 'approve':
        status = 'approved';
        break;
      case 'reject':
        status = 'rejected';
        break;
      case 'edit':
        status = 'approved';
        if (!editedContent) {
          throw new Error('editedContent is required for edit action');
        }
        break;
      default:
        status = 'pending';
    }

    const updateData: any = {
      status,
    };

    if (editedContent !== undefined) {
      updateData.content = editedContent;
      updateData.user_feedback = editedContent;
    }

    await db('memory_candidates').where({ id: candidateId }).update(updateData);
  }
}

// Singleton instance
export const autoMemoryExtractionService = new AutoMemoryExtractionService();
