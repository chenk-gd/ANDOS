import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Asset, AssetType, AssetNode } from '@/types/asset'
import { assetsApi } from '@/services/api'
import { ASSET_TYPE_LABELS } from '@/types/asset'

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
  data: T
  timestamp: number
}

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([])
  const currentAsset = ref<Asset | null>(null)
  const loading = ref(false)
  const selectedId = ref<string | null>(null)

  // Cache storage
  const assetsCache = ref<CacheEntry<Asset[]> | null>(null)
  const assetCache = ref<Map<string, CacheEntry<Asset>>>(new Map())

  const assetTree = computed<AssetNode[]>(() => {
    const typeOrder: AssetType[] = ['requirement', 'design', 'task', 'code', 'test', 'pipeline']
    return typeOrder.map(type => ({
      id: `type-${type}`,
      name: ASSET_TYPE_LABELS[type],
      type,
      state: 'clean' as const,
      children: assets.value
        .filter(a => a.type === type)
        .map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          state: a.state,
        })),
    }))
  })

  // Check if cache is valid
  function isCacheValid<T>(entry: CacheEntry<T> | null): boolean {
    if (!entry) return false
    return Date.now() - entry.timestamp < CACHE_DURATION
  }

  async function fetchAssets(projectId?: string, options?: { forceRefresh?: boolean }) {
    // Check cache first
    if (!options?.forceRefresh && assetsCache.value && isCacheValid(assetsCache.value)) {
      assets.value = assetsCache.value.data
      return
    }

    loading.value = true
    try {
      const response = await assetsApi.list(projectId)
      assets.value = response.data

      // Update cache
      assetsCache.value = {
        data: response.data,
        timestamp: Date.now(),
      }
    } finally {
      loading.value = false
    }
  }

  async function selectAsset(id: string, options?: { forceRefresh?: boolean }) {
    selectedId.value = id

    // Check cache first
    const cached = assetCache.value.get(id)
    if (!options?.forceRefresh && cached && isCacheValid(cached)) {
      currentAsset.value = cached.data
      return
    }

    loading.value = true
    try {
      const response = await assetsApi.get(id)
      currentAsset.value = response.data

      // Update cache
      assetCache.value.set(id, {
        data: response.data,
        timestamp: Date.now(),
      })
    } finally {
      loading.value = false
    }
  }

  function invalidateAssetCache(id?: string) {
    if (id) {
      assetCache.value.delete(id)
    } else {
      assetCache.value.clear()
      assetsCache.value = null
    }
  }

  async function updateAsset(asset: Asset) {
    const response = await assetsApi.update(asset.id, asset)
    const updated = response.data

    // Update in list
    const index = assets.value.findIndex(a => a.id === updated.id)
    if (index > -1) {
      assets.value[index] = updated
    }

    // Update current asset if selected
    if (currentAsset.value?.id === updated.id) {
      currentAsset.value = updated
    }

    // Invalidate caches
    invalidateAssetCache(updated.id)
    assetsCache.value = null
  }

  async function markClean(id: string) {
    const response = await assetsApi.markClean(id)
    const updated = response.data

    // Update in list
    const index = assets.value.findIndex(a => a.id === updated.id)
    if (index > -1) {
      assets.value[index] = updated
    }

    // Update current asset if selected
    if (currentAsset.value?.id === updated.id) {
      currentAsset.value = updated
    }

    // Invalidate caches
    invalidateAssetCache(updated.id)
  }

  async function updateAssetContent(id: string, _content: string) {
    const response = await assetsApi.markClean(id)
    const updated = response.data

    // Update in list
    const index = assets.value.findIndex(a => a.id === updated.id)
    if (index > -1) {
      assets.value[index] = updated
    }

    // Update current asset if selected
    if (currentAsset.value?.id === updated.id) {
      currentAsset.value = updated
    }

    // Invalidate caches
    invalidateAssetCache(updated.id)
  }

  return {
    assets,
    currentAsset,
    loading,
    selectedId,
    assetTree,
    fetchAssets,
    selectAsset,
    updateAsset,
    markClean,
    updateAssetContent,
    invalidateAssetCache,
  }
})
