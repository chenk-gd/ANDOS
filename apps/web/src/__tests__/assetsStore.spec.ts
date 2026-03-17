import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAssetsStore } from '@/stores/assets'
import * as apiModule from '@/services/api'

// Mock the API module
vi.mock('@/services/api', () => ({
  assetsApi: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    markClean: vi.fn(),
  },
}))

describe('Assets Store', () => {
  const mockAssets = [
    { id: '1', name: 'Asset 1', type: 'requirement', state: 'clean', projectId: 'p1', slug: 'asset-1', currentVersion: '1.0', owners: [], tags: [], createdAt: '', updatedAt: '' },
    { id: '2', name: 'Asset 2', type: 'code', state: 'dirty', projectId: 'p1', slug: 'asset-2', currentVersion: '1.1', owners: [], tags: [], createdAt: '', updatedAt: '' },
    { id: '3', name: 'Asset 3', type: 'design', state: 'draft', projectId: 'p1', slug: 'asset-3', currentVersion: '0.1', owners: [], tags: [], createdAt: '', updatedAt: '' },
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with correct default state', () => {
    const store = useAssetsStore()
    expect(store.assets).toEqual([])
    expect(store.currentAsset).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.selectedId).toBeNull()
  })

  describe('assetTree computed', () => {
    it('groups assets by type', () => {
      const store = useAssetsStore()
      store.assets = mockAssets

      const tree = store.assetTree
      expect(tree).toHaveLength(6) // 6 asset types

      // Check that types are in correct order
      expect(tree[0].type).toBe('requirement')
      expect(tree[1].type).toBe('design')
      expect(tree[2].type).toBe('task')
      expect(tree[3].type).toBe('code')

      // Check that assets are grouped correctly
      const requirementNode = tree[0]
      expect(requirementNode.children).toHaveLength(1)
      expect(requirementNode.children![0].id).toBe('1')

      const codeNode = tree[3]
      expect(codeNode.children).toHaveLength(1)
      expect(codeNode.children![0].id).toBe('2')
    })

    it('returns empty children for types with no assets', () => {
      const store = useAssetsStore()
      store.assets = []

      const tree = store.assetTree
      expect(tree.every(node => node.children?.length === 0)).toBe(true)
    })
  })

  describe('fetchAssets', () => {
    it('fetches assets and updates state', async () => {
      const store = useAssetsStore()
      vi.mocked(apiModule.assetsApi.list).mockResolvedValue({ data: mockAssets })

      await store.fetchAssets('p1')

      expect(apiModule.assetsApi.list).toHaveBeenCalledWith('p1')
      expect(store.assets).toEqual(mockAssets)
      expect(store.loading).toBe(false)
    })

    it('sets loading state during fetch', async () => {
      const store = useAssetsStore()
      vi.mocked(apiModule.assetsApi.list).mockImplementation(() => new Promise(resolve => {
        expect(store.loading).toBe(true)
        resolve({ data: mockAssets })
      }))

      await store.fetchAssets()
      expect(store.loading).toBe(false)
    })

    it('handles fetch without projectId', async () => {
      const store = useAssetsStore()
      vi.mocked(apiModule.assetsApi.list).mockResolvedValue({ data: mockAssets })

      await store.fetchAssets()

      expect(apiModule.assetsApi.list).toHaveBeenCalledWith(undefined)
    })
  })

  describe('selectAsset', () => {
    it('selects asset and fetches details', async () => {
      const store = useAssetsStore()
      const mockAsset = mockAssets[0]
      vi.mocked(apiModule.assetsApi.get).mockResolvedValue({ data: mockAsset })

      await store.selectAsset('1')

      expect(store.selectedId).toBe('1')
      expect(apiModule.assetsApi.get).toHaveBeenCalledWith('1')
      expect(store.currentAsset).toEqual(mockAsset)
    })

    it('sets loading during selection', async () => {
      const store = useAssetsStore()
      vi.mocked(apiModule.assetsApi.get).mockResolvedValue({ data: mockAssets[0] })

      const promise = store.selectAsset('1')
      expect(store.loading).toBe(true)
      await promise
      expect(store.loading).toBe(false)
    })
  })

  describe('updateAsset', () => {
    it('updates asset in list and current asset', async () => {
      const store = useAssetsStore()
      store.assets = [...mockAssets]
      store.currentAsset = { ...mockAssets[0] }

      const updatedAsset = { ...mockAssets[0], name: 'Updated Asset' }
      vi.mocked(apiModule.assetsApi.update).mockResolvedValue({ data: updatedAsset })

      await store.updateAsset(updatedAsset as any)

      expect(apiModule.assetsApi.update).toHaveBeenCalledWith('1', updatedAsset)
      expect(store.assets[0].name).toBe('Updated Asset')
      expect(store.currentAsset?.name).toBe('Updated Asset')
    })

    it('updates asset in list only if not current', async () => {
      const store = useAssetsStore()
      store.assets = [...mockAssets]
      store.currentAsset = { ...mockAssets[1] } // Different asset

      const updatedAsset = { ...mockAssets[0], name: 'Updated Asset' }
      vi.mocked(apiModule.assetsApi.update).mockResolvedValue({ data: updatedAsset })

      await store.updateAsset(updatedAsset as any)

      expect(store.assets[0].name).toBe('Updated Asset')
      expect(store.currentAsset?.name).toBe('Asset 2') // Unchanged
    })
  })

  describe('markClean', () => {
    it('marks asset as clean and updates state', async () => {
      const store = useAssetsStore()
      store.assets = [...mockAssets]

      const cleanedAsset = { ...mockAssets[1], state: 'clean' }
      vi.mocked(apiModule.assetsApi.markClean).mockResolvedValue({ data: cleanedAsset })

      await store.markClean('2')

      expect(apiModule.assetsApi.markClean).toHaveBeenCalledWith('2')
      expect(store.assets.find(a => a.id === '2')?.state).toBe('clean')
    })

    it('updates current asset if it matches', async () => {
      const store = useAssetsStore()
      store.assets = [...mockAssets]
      store.currentAsset = { ...mockAssets[1] }

      const cleanedAsset = { ...mockAssets[1], state: 'clean' }
      vi.mocked(apiModule.assetsApi.markClean).mockResolvedValue({ data: cleanedAsset })

      await store.markClean('2')

      expect(store.currentAsset?.state).toBe('clean')
    })
  })
})
