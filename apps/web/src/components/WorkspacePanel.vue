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
          <el-button type="warning" @click="showImpactAnalysis">
            影响分析
          </el-button>
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
            <!-- 结构化资产：使用 StructuredEditor -->
            <StructuredEditor
              v-if="isStructuredAsset"
              v-model="structuredContent"
              :schema="assetSchema"
              @change="handleStructuredChange"
              @save="handleStructuredSave"
              @publish="showPublishDialog = true"
            />
            <!-- 代码/流水线资产：使用 TextEditor -->
            <TextEditor
              v-else-if="isTextAsset"
              v-model="assetContent"
              :filename="currentAsset.slug"
              :asset-id="currentAsset.id"
              @save="handleAutoSave"
            />
            <!-- 其他资产：使用基础表单 -->
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

        <el-tab-pane label="记忆管理" name="memory">
          <div class="tab-content">
            <MemoryManager :project-id="currentAsset.projectId || 'default-project'" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <!-- 发布版本对话框 -->
    <PublishVersionDialog
      v-model="showPublishDialog"
      :current-asset="currentAsset"
      :current-content="currentContentForPublish"
      :previous-content="previousContentForPublish"
      @publish="handlePublish"
    />

    <!-- 影响分析对话框 -->
    <el-dialog
      v-model="showImpactDialog"
      title="影响分析"
      width="800px"
      :close-on-click-modal="false"
    >
      <div v-if="impactLoading" class="impact-loading">
        <el-loading text="分析中..." />
      </div>
      <div v-else-if="impactData" class="impact-content">
        <div class="impact-summary">
          <el-alert
            :title="`发布此版本将影响 ${impactData.affectedCount} 个下游资产`"
            type="warning"
            :closable="false"
            show-icon
          />
        </div>
        <div class="impact-graph">
          <h4>下游依赖图谱</h4>
          <DagCanvas
            :graph="impactData.graph"
            :selected-node-id="currentAsset?.id"
            @select="handleImpactNodeSelect"
          />
        </div>
        <div class="impact-list">
          <h4>受影响的资产</h4>
          <el-table :data="impactData.affectedAssets" size="small">
            <el-table-column prop="name" label="资产名称" />
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="state" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getStateType(row.state)">{{ row.state }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="impactLevel" label="影响级别" width="120">
              <template #default="{ row }">
                <el-tag :type="getImpactLevelType(row.impactLevel)">
                  {{ row.impactLevel || 'medium' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      <template #footer>
        <el-button @click="showImpactDialog = false">关闭</el-button>
        <el-button type="primary" @click="handlePublishAfterAnalysis">
          确认并发布
        </el-button>
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
import StructuredEditor from './StructuredEditor.vue'
import PublishVersionDialog from './PublishVersionDialog.vue'
import MemoryManager from './MemoryManager.vue'
import { getAssetSchema, getDefaultContent } from '@/schemas/assetSchemas'
import { assetsApi } from '@/services/api'
import { graphApi, type DependencyGraph, type GraphEdge } from '@/services/graph'
import type { Asset, AssetState, AssetVersion } from '@/types/asset'
import { ElMessageBox, ElMessage } from 'element-plus'

const assetsStore = useAssetsStore()
const layoutStore = useLayoutStore()

const currentAsset = computed(() => assetsStore.currentAsset)
const activeTab = computed({
  get: () => layoutStore.activeTab,
  set: (val) => { layoutStore.activeTab = val }
})

// 资产类型判断
const isTextAsset = computed(() =>
  currentAsset.value?.type === 'code' || currentAsset.value?.type === 'pipeline'
)

const isStructuredAsset = computed(() =>
  currentAsset.value?.type === 'requirement' ||
  currentAsset.value?.type === 'design' ||
  currentAsset.value?.type === 'task' ||
  currentAsset.value?.type === 'test'
)

// 结构化编辑器相关
const assetSchema = computed(() => {
  if (!currentAsset.value) return []
  return getAssetSchema(currentAsset.value.type)
})

const structuredContent = ref<Record<string, any>>({})
const originalStructuredContent = ref('')

const assetContent = ref('')
const dependencyGraph = ref<DependencyGraph | null>(null)
const showPublishDialog = ref(false)
const showImpactDialog = ref(false)
const impactLoading = ref(false)
const impactData = ref<{
  affectedCount: number
  graph: DependencyGraph
  affectedAssets: Array<{
    id: string
    name: string
    type: string
    state: AssetState
    impactLevel?: 'high' | 'medium' | 'low'
  }>
} | null>(null)

// 发布对话框内容对比
const currentContentForPublish = computed(() => {
  if (isStructuredAsset.value) {
    return JSON.stringify(structuredContent.value, null, 2)
  }
  return assetContent.value
})

const previousContentForPublish = ref('')

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

function getImpactLevelType(level?: string): 'danger' | 'warning' | 'info' {
  const map: Record<string, 'danger' | 'warning' | 'info'> = {
    high: 'danger',
    medium: 'warning',
    low: 'info',
  }
  return map[level || 'medium'] || 'warning'
}

// 影响分析
async function showImpactAnalysis() {
  if (!currentAsset.value) return

  showImpactDialog.value = true
  impactLoading.value = true

  try {
    // 获取下游依赖数据
    const downstream = await graphApi.getDownstream(currentAsset.value.id, 3)

    // 计算受影响的资产
    const affectedAssets = downstream.data.nodes
      .filter(node => node.id !== currentAsset.value?.id)
      .map(node => ({
        id: node.id,
        name: node.label,
        type: node.type,
        state: node.state as AssetState,
        // 根据深度计算影响级别
        impactLevel: calculateImpactLevel(node.id, downstream.data.edges, currentAsset.value!.id) as 'high' | 'medium' | 'low',
      }))

    impactData.value = {
      affectedCount: affectedAssets.length,
      graph: downstream.data,
      affectedAssets,
    }
  } catch (error) {
    console.error('Failed to load impact analysis:', error)
    ElMessage.error('影响分析加载失败')
  } finally {
    impactLoading.value = false
  }
}

// 计算影响级别
function calculateImpactLevel(nodeId: string, edges: GraphEdge[], sourceId: string): string {
  // 构建节点到源节点的距离
  const distances = new Map<string, number>()
  distances.set(sourceId, 0)

  // BFS计算距离
  let changed = true
  while (changed) {
    changed = false
    for (const edge of edges) {
      const sourceDist = distances.get(edge.source)
      if (sourceDist !== undefined) {
        const targetDist = distances.get(edge.target)
        if (targetDist === undefined || targetDist > sourceDist + 1) {
          distances.set(edge.target, sourceDist + 1)
          changed = true
        }
      }
    }
  }

  const distance = distances.get(nodeId) || 999
  if (distance <= 1) return 'high'
  if (distance <= 2) return 'medium'
  return 'low'
}

function handleImpactNodeSelect(nodeId: string) {
  // 在影响分析中点击节点，可以高亮或显示详情
  console.log('Selected impact node:', nodeId)
}

function handlePublishAfterAnalysis() {
  showImpactDialog.value = false
  showPublishDialog.value = true
}

function handleAutoSave(content: string) {
  if (!currentAsset.value) return
  console.log('Auto-save:', content)
}

// 结构化编辑器变更处理
function handleStructuredChange(data: Record<string, any>) {
  console.log('Structured content changed:', data)
}

// 结构化编辑器保存处理
async function handleStructuredSave(data: Record<string, any>) {
  if (!currentAsset.value) return
  try {
    // 将结构化数据序列化为 content
    const content = JSON.stringify(data)
    await assetsStore.updateAssetContent(currentAsset.value.id, content)
    ElMessage.success('保存成功')
  } catch (error) {
    console.error('Save failed:', error)
    ElMessage.error('保存失败')
  }
}

// 发布版本
async function handlePublish(data: { version: string; changelog: string; changeTypes: string[] }) {
  if (!currentAsset.value) return
  try {
    // 如果有结构化内容，先保存
    if (isStructuredAsset.value && structuredContent.value) {
      const content = JSON.stringify(structuredContent.value)
      await assetsStore.updateAssetContent(currentAsset.value.id, content)
    }

    await assetsApi.publishVersion(
      currentAsset.value.id,
      data.version,
      data.changelog
    )
    showPublishDialog.value = false
    await assetsStore.selectAsset(currentAsset.value.id)
    ElMessage.success('版本发布成功')
  } catch (error) {
    console.error('Publish failed:', error)
    ElMessage.error('发布失败')
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
    structuredContent.value = {}
    previousContentForPublish.value = ''
    return
  }

  // 初始化内容
  if (isStructuredAsset.value) {
    // 结构化资产使用默认内容
    structuredContent.value = getDefaultContent(currentAsset.value!.type)
    originalStructuredContent.value = ''
  } else {
    assetContent.value = `# ${currentAsset.value?.name}\n\nAsset content here...`
  }

  // 加载上游依赖图谱
  try {
    const upstream = await graphApi.getUpstream(assetId, 3)
    dependencyGraph.value = upstream.data
  } catch (error) {
    console.error('Failed to load graph:', error)
  }

  // 加载上一个版本的内容用于对比
  try {
    const versions = await assetsApi.listVersions(assetId)
    if (versions.data.length > 0) {
      // 获取最新版本的内容
      const latestVersion = versions.data[0]
      previousContentForPublish.value = latestVersion.content || ''
    } else {
      previousContentForPublish.value = ''
    }
  } catch (error) {
    console.error('Failed to load previous version:', error)
    previousContentForPublish.value = ''
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

/* Impact Analysis Styles */
.impact-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.impact-content {
  max-height: 600px;
  overflow-y: auto;
}

.impact-summary {
  margin-bottom: 20px;
}

.impact-graph {
  margin-bottom: 20px;
}

.impact-graph h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.impact-list h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.structured-form {
  padding: 20px;
}
</style>
