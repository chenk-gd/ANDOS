import { describe, it, expect } from 'vitest'
import {
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
  ASSET_STATE_COLORS,
  type AssetType,
  type AssetState,
} from '@/types/asset'

describe('Asset Types', () => {
  describe('ASSET_TYPE_LABELS', () => {
    it('should have labels for all asset types', () => {
      const types: AssetType[] = ['requirement', 'design', 'task', 'code', 'test', 'pipeline']
      types.forEach((type) => {
        expect(ASSET_TYPE_LABELS[type]).toBeDefined()
        expect(typeof ASSET_TYPE_LABELS[type]).toBe('string')
      })
    })

    it('should have correct Chinese labels', () => {
      expect(ASSET_TYPE_LABELS.requirement).toBe('需求')
      expect(ASSET_TYPE_LABELS.design).toBe('设计')
      expect(ASSET_TYPE_LABELS.task).toBe('任务')
      expect(ASSET_TYPE_LABELS.code).toBe('代码')
      expect(ASSET_TYPE_LABELS.test).toBe('测试')
      expect(ASSET_TYPE_LABELS.pipeline).toBe('流水线')
    })
  })

  describe('ASSET_TYPE_ICONS', () => {
    it('should have icons for all asset types', () => {
      const types: AssetType[] = ['requirement', 'design', 'task', 'code', 'test', 'pipeline']
      types.forEach((type) => {
        expect(ASSET_TYPE_ICONS[type]).toBeDefined()
        expect(typeof ASSET_TYPE_ICONS[type]).toBe('string')
      })
    })
  })

  describe('ASSET_STATE_COLORS', () => {
    it('should have colors for all asset states', () => {
      const states: AssetState[] = ['draft', 'clean', 'dirty', 'modified', 'archived']
      states.forEach((state) => {
        expect(ASSET_STATE_COLORS[state]).toBeDefined()
        expect(ASSET_STATE_COLORS[state]).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })

    it('should have valid hex colors', () => {
      Object.values(ASSET_STATE_COLORS).forEach((color) => {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })
  })
})
