<template>
  <div class="workspace-panel">
    <div v-if="!currentAsset" class="empty-state">
      <el-empty description="选择一个资产开始编辑" />
    </div>

    <template v-else>
      <div class="asset-header">
        <h2 class="asset-title">{{ currentAsset.name }}</h2>
        <div class="asset-meta">
          <el-tag :type="getStateType(currentAsset.state)">{{ currentAsset.state }}</el-tag>
          <span class="version">v{{ currentAsset.currentVersion }}</span>
          <el-button type="primary" @click="showPublishDialog = true">
            发布版本
          </el-button>
          <el-button type="danger" @click="handleDelete">
            删除
          </el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="workspace-tabs">
        <el-tab-pane label="编辑" name="form">
          <div class="tab-content">
            <TextEditor
              v-if="isTextAsset"
              v-model="assetContent"
              :filename="currentAsset.slug"
              :asset-id="currentAsset.id"
              @save="handleAutoSave"
            />
            <AssetDetailForm
              v-else
              :asset="currentAsset"
              @update="handleAssetUpdate"
              @mark-clean="handleMarkClean"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="依赖图谱" name="dag">
          <div class="tab-content">
            <DagCanvas
              :graph="dependencyGraph"
              :selected-node-id="currentAsset.id"
              @select="handleNodeSelect"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="版本历史" name="versions">
          <div class="tab-content">
            <VersionHistoryPanel
              :asset-id="currentAsset.id"
              @restore="handleVersionRestore"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <el-dialog v-model="showPublishDialog" title="发布新版本" width="500px">
      <el-form>
        <el-form-item label="版本号">
          <el-input v-model="publishForm.version" placeholder="例如: 1.0.0" />
        </el-form-item>
        <el-form-item label="变更说明">
          <el-input
            v-model="publishForm.changelog"
            type="textarea"
            rows="4"
            placeholder="描述本次变更内容..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPublishDialog = false">取消</el-button>
        <el-button type="primary" @click="handlePublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssetsStore } from '@/stores/assets'
import { useLayoutStore } from '@/stores/layout'
import TextEditor from './TextEditor.vue'
import DagCanvas from './DagCanvas.vue'
import AssetDetailForm from './AssetDetailForm.vue'
import VersionHistoryPanel from './VersionHistoryPanel.vue'
import { assetsApi } from '@/services/api'
import { graphApi, type DependencyGraph } from '@/services/graph'
import type { Asset, AssetState, AssetVersion } from '@/types/asset'
import { ElMessageBox, ElMessage } from 'element-plus'

const assetsStore = useAssetsStore()
const layoutStore = useLayoutStore()

const currentAsset = computed(() => assetsStore.currentAsset)
const activeTab = computed({
  get: () => layoutStore.activeTab,
  set: (val) => { layoutStore.activeTab = val }
})

const isTextAsset = computed(() =>
  currentAsset.value?.type === 'code' || currentAsset.value?.type === 'pipeline'
)

const assetContent = ref('')
const dependencyGraph = ref<DependencyGraph | null>(null)
const showPublishDialog = ref(false)
const publishForm = ref({ version: '', changelog: '' })

function getStateType(state: AssetState): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<AssetState, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    clean: 'success',
    dirty: 'warning',
    modified: 'info',
    archived: 'danger',
  }
  return map[state]
}

function handleAutoSave(content: string) {
  if (!currentAsset.value) return
  console.log('Auto-save:', content)
}

async function handlePublish() {
  if (!currentAsset.value) return
  try {
    await assetsApi.publishVersion(
      currentAsset.value.id,
      publishForm.value.version,
      publishForm.value.changelog
    )
    showPublishDialog.value = false
    await assetsStore.selectAsset(currentAsset.value.id)
  } catch (error) {
    console.error('Publish failed:', error)
  }
}

function handleNodeSelect(nodeId: string) {
  assetsStore.selectAsset(nodeId)
}

function handleAssetUpdate(asset: Asset) {
  assetsStore.updateAsset(asset)
}

async function handleDelete() {
  if (!currentAsset.value) return

  try {
    await ElMessageBox.confirm(
      `确定要删除资产 "${currentAsset.value.name}" 吗？`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await assetsApi.delete(currentAsset.value.id)
    ElMessage.success('资产已删除')

    // Clear current asset and refresh list
    assetsStore.currentAsset = null
    assetsStore.selectedId = null
    assetsStore.fetchAssets()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete asset:', error)
      const message = error instanceof Error ? error.message : '删除失败'
      ElMessage.error(message)
    }
  }
}

function handleMarkClean(id: string) {
  assetsStore.markClean(id)
}

function handleVersionRestore(version: AssetVersion) {
  console.log('Restore version:', version)
  // TODO: Implement version restore functionality
  // This would typically call an API to restore the asset to this version
}

watch(() => currentAsset.value?.id, async (assetId) => {
  if (!assetId) {
    dependencyGraph.value = null
    return
  }
  assetContent.value = `# ${currentAsset.value?.name}\n\nAsset content here...`
  try {
    const upstream = await graphApi.getUpstream(assetId, 3)
    dependencyGraph.value = upstream.data
  } catch (error) {
    console.error('Failed to load graph:', error)
  }
}, { immediate: true })
</script>

<style scoped>
.workspace-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.asset-title {
  margin: 0;
  font-size: 18px;
}

.asset-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version {
  color: var(--text-secondary);
}

.workspace-tabs {
  flex: 1;
}

.workspace-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
}

.tab-content {
  height: 100%;
  padding: 16px;
}

.structured-form {
  padding: 20px;
}
</style>
