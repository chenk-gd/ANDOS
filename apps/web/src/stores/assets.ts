import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Asset, AssetType, AssetNode } from '@/types/asset'
import { assetsApi } from '@/services/api'
import { ASSET_TYPE_LABELS } from '@/types/asset'

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([])
  const currentAsset = ref<Asset | null>(null)
  const loading = ref(false)
  const selectedId = ref<string | null>(null)

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

  async function fetchAssets(projectId?: string) {
    loading.value = true
    try {
      const response = await assetsApi.list(projectId)
      assets.value = response.data
    } finally {
      loading.value = false
    }
  }

  async function selectAsset(id: string) {
    selectedId.value = id
    loading.value = true
    try {
      const response = await assetsApi.get(id)
      currentAsset.value = response.data
    } finally {
      loading.value = false
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
  }

  async function updateAssetContent(id: string, content: string) {
    const response = await assetsApi.update(id, { content })
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
  }
})
