<template>
  <div class="version-history-panel">
    <div v-if="!assetId" class="empty-state">
      <el-empty description="选择资产以查看版本历史" />
    </div>

    <div v-else-if="loading" class="loading-state">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="versions.length === 0" class="empty-state">
      <el-empty description="暂无版本历史" />
    </div>

    <div v-else class="version-list">
      <div
        v-for="(version, index) in versions"
        :key="version.id"
        :class="['version-item', { current: index === 0 }]"
      >
        <div class="version-header">
          <div class="version-info">
            <span class="version-number">v{{ version.version }}</span>
            <el-tag v-if="index === 0" type="success" size="small">当前</el-tag>
          </div>
          <span class="version-date">{{ formatDate(version.createdAt) }}</span>
        </div>

        <div class="version-author">
          <el-icon><User /></el-icon>
          <span>{{ version.createdBy }}</span>
        </div>

        <div v-if="version.changelog" class="version-changelog">
          {{ version.changelog }}
        </div>

        <div class="version-actions">
          <el-button
            v-if="index > 0"
            link
            type="primary"
            size="small"
            @click="handleCompare(version)"
          >
            对比
          </el-button>
          <el-button
            v-if="index > 0"
            link
            type="primary"
            size="small"
            @click="handleRestore(version)"
          >
            恢复
          </el-button>
        </div>
      </div>
    </div>

    <!-- Compare Dialog -->
    <el-dialog
      v-model="showCompareDialog"
      title="版本对比"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="compare-content">
        <div class="compare-pane">
          <h4>当前版本 (v{{ versions[0]?.version }})</h4>
          <pre class="code-block">{{ versions[0]?.content }}</pre>
        </div>
        <div class="compare-pane">
          <h4>选中版本 (v{{ selectedVersion?.version }})</h4>
          <pre class="code-block">{{ selectedVersion?.content }}</pre>
        </div>
      </div>
    </el-dialog>

    <!-- Restore Confirm Dialog -->
    <el-dialog
      v-model="showRestoreDialog"
      title="恢复版本"
      width="400px"
    >
      <p>确定要恢复到版本 v{{ selectedVersion?.version }} 吗？</p>
      <p class="restore-warning">这将创建一个新的版本，当前内容会被保存到历史记录中。</p>
      <template #footer>
        <el-button @click="showRestoreDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRestore">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { User } from '@element-plus/icons-vue'
import type { AssetVersion } from '@/types/asset'
import { assetsApi } from '@/services/api'

interface Props {
  assetId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  restore: [version: AssetVersion]
}>()

const versions = ref<AssetVersion[]>([])
const loading = ref(false)
const showCompareDialog = ref(false)
const showRestoreDialog = ref(false)
const selectedVersion = ref<AssetVersion | null>(null)

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadVersions() {
  if (!props.assetId) {
    versions.value = []
    return
  }

  loading.value = true
  try {
    const response = await assetsApi.listVersions(props.assetId)
    versions.value = response.data.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  } catch (error) {
    console.error('Failed to load versions:', error)
    versions.value = []
  } finally {
    loading.value = false
  }
}

function handleCompare(version: AssetVersion) {
  selectedVersion.value = version
  showCompareDialog.value = true
}

function handleRestore(version: AssetVersion) {
  selectedVersion.value = version
  showRestoreDialog.value = true
}

function confirmRestore() {
  if (selectedVersion.value) {
    emit('restore', selectedVersion.value)
    showRestoreDialog.value = false
  }
}

// Load versions when assetId changes
watch(() => props.assetId, () => {
  loadVersions()
}, { immediate: true })
</script>

<style scoped>
.version-history-panel {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.empty-state,
.loading-state {
  padding: 40px 0;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-item {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.version-item.current {
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-number {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary);
}

.version-date {
  font-size: 13px;
  color: var(--text-secondary);
}

.version-author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.version-changelog {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 12px;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
}

.version-actions {
  display: flex;
  gap: 16px;
}

.compare-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-height: 500px;
  overflow-y: auto;
}

.compare-pane {
  h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: var(--text-primary);
  }
}

.code-block {
  background: var(--bg-secondary);
  padding: 12px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

.restore-warning {
  color: var(--el-color-warning);
  font-size: 13px;
  margin-top: 8px;
}
</style>
