<template>
  <ErrorBoundary>
    <MainLayout>
      <template #left>
        <CollapsiblePanel title="资产浏览器" :collapsible="false">
          <AssetTree
            @select="handleAssetSelect"
            @create="showCreateDialog = true"
            @view-deleted="showDeletedDialog = true"
          />
        </CollapsiblePanel>
      </template>
      <template #center>
        <WorkspacePanel />
      </template>
      <template #right>
        <CollapsiblePanel title="通知" :collapsed="true">
          <p>通知列表 (TODO)</p>
        </CollapsiblePanel>
        <CollapsiblePanel title="AI 助手">
          <AiChatPanel :project-id="currentProjectId" />
        </CollapsiblePanel>
        <CollapsiblePanel title="会话历史" :collapsed="true">
          <AgentSessionHistory
            :project-id="currentProjectId"
            @restore="handleSessionRestore"
            @create="handleSessionCreate"
          />
        </CollapsiblePanel>
      </template>
      <CreateAssetDialog
        v-model="showCreateDialog"
        @created="handleAssetCreated"
      />
      <DeletedAssetsDialog
        v-model="showDeletedDialog"
        @restored="handleAssetRestored"
      />
    </MainLayout>
  </ErrorBoundary>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MainLayout from './layouts/MainLayout.vue'
import CollapsiblePanel from './components/CollapsiblePanel.vue'
import AssetTree from './components/AssetTree.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import AiChatPanel from './components/AiChatPanel.vue'
import AgentSessionHistory from './components/AgentSessionHistory.vue'
import CreateAssetDialog from './components/CreateAssetDialog.vue'
import DeletedAssetsDialog from './components/DeletedAssetsDialog.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import { useAssetsStore } from './stores/assets'
import { wsService } from './services/websocket'
import { setupGlobalErrorHandler } from './composables/useErrorHandler'

const assetsStore = useAssetsStore()
const showCreateDialog = ref(false)
const showDeletedDialog = ref(false)

// 当前项目ID - 后续可从路由或用户选择中获取
const currentProjectId = ref(localStorage.getItem('currentProjectId') || 'default-project')

onMounted(() => {
  // 设置全局错误处理
  setupGlobalErrorHandler()

  const token = localStorage.getItem('token') || 'test-token'
  wsService.connect(token)
  assetsStore.fetchAssets()
})

onUnmounted(() => {
  wsService.disconnect()
})

function handleAssetSelect(id: string) {
  assetsStore.selectAsset(id)
}

function handleAssetCreated() {
  assetsStore.fetchAssets()
}

function handleAssetRestored() {
  assetsStore.fetchAssets()
}

function handleSessionRestore(sessionId: string) {
  console.log('Restore session:', sessionId)
  // TODO: 集成到 AiChatPanel 恢复会话
}

function handleSessionCreate() {
  console.log('Create new session')
  // TODO: 通知 AiChatPanel 创建新会话
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
}

.placeholder {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
