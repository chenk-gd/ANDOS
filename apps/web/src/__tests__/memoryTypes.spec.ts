import { describe, it, expect } from 'vitest'
import {
  MEMORY_TYPE_LABELS,
  MEMORY_STATUS_LABELS,
  type MemoryType,
  type MemoryStatus,
} from '@/types/memory'

describe('Memory Types', () => {
  describe('MEMORY_TYPE_LABELS', () => {
    it('contains all memory type labels', () => {
      expect(MEMORY_TYPE_LABELS).toHaveProperty('requirement')
      expect(MEMORY_TYPE_LABELS).toHaveProperty('design')
      expect(MEMORY_TYPE_LABELS).toHaveProperty('decision')
      expect(MEMORY_TYPE_LABELS).toHaveProperty('constraint')
      expect(MEMORY_TYPE_LABELS).toHaveProperty('context')
      expect(MEMORY_TYPE_LABELS).toHaveProperty('preference')
    })

    it('has correct Chinese labels', () => {
      expect(MEMORY_TYPE_LABELS.requirement).toBe('需求')
      expect(MEMORY_TYPE_LABELS.design).toBe('设计')
      expect(MEMORY_TYPE_LABELS.decision).toBe('决策')
      expect(MEMORY_TYPE_LABELS.constraint).toBe('约束')
      expect(MEMORY_TYPE_LABELS.context).toBe('上下文')
      expect(MEMORY_TYPE_LABELS.preference).toBe('偏好')
    })

    it('all types have labels', () => {
      const types: MemoryType[] = ['requirement', 'design', 'decision', 'constraint', 'context', 'preference']
      types.forEach((type) => {
        expect(MEMORY_TYPE_LABELS[type]).toBeDefined()
        expect(typeof MEMORY_TYPE_LABELS[type]).toBe('string')
        expect(MEMORY_TYPE_LABELS[type].length).toBeGreaterThan(0)
      })
    })
  })

  describe('MEMORY_STATUS_LABELS', () => {
    it('contains all memory status labels', () => {
      expect(MEMORY_STATUS_LABELS).toHaveProperty('active')
      expect(MEMORY_STATUS_LABELS).toHaveProperty('archived')
      expect(MEMORY_STATUS_LABELS).toHaveProperty('pending_review')
    })

    it('has correct Chinese labels', () => {
      expect(MEMORY_STATUS_LABELS.active).toBe('活跃')
      expect(MEMORY_STATUS_LABELS.archived).toBe('已归档')
      expect(MEMORY_STATUS_LABELS.pending_review).toBe('待审核')
    })

    it('all statuses have labels', () => {
      const statuses: MemoryStatus[] = ['active', 'archived', 'pending_review']
      statuses.forEach((status) => {
        expect(MEMORY_STATUS_LABELS[status]).toBeDefined()
        expect(typeof MEMORY_STATUS_LABELS[status]).toBe('string')
        expect(MEMORY_STATUS_LABELS[status].length).toBeGreaterThan(0)
      })
    })
  })

  describe('Type constraints', () => {
    it('MemoryType union accepts valid types', () => {
      const validTypes: MemoryType[] = ['requirement', 'design', 'decision', 'constraint', 'context', 'preference']
      validTypes.forEach((type) => {
        expect(MEMORY_TYPE_LABELS[type]).toBeDefined()
      })
    })

    it('MemoryStatus union accepts valid statuses', () => {
      const validStatuses: MemoryStatus[] = ['active', 'archived', 'pending_review']
      validStatuses.forEach((status) => {
        expect(MEMORY_STATUS_LABELS[status]).toBeDefined()
      })
    })
  })
})
