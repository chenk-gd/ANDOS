<template>
  <div class="asset-tree">
    <div class="tree-header">
      <el-input
        v-model="searchQuery"
        placeholder="搜索资产..."
        :prefix-icon="Search"
        clearable
      />
      <el-button :icon="Plus" circle size="small" @click="handleCreate" />
      <el-button :icon="Delete" circle size="small" @click="handleViewDeleted" />
    </div>

    <el-tree
      :data="treeData"
      :props="{ children: 'children', label: 'name' }"
      :expand-on-click-node="false"
      :default-expanded-keys="expandedKeys"
      @node-click="handleNodeClick"
    >
      <template #default="{ node, data }">
        <div class="tree-node" :class="{ 'is-type': !data.children, 'is-selected': selectedId === data.id }">
          <el-icon v-if="data.children" class="type-icon">
            <component :is="ASSET_TYPE_ICONS[data.type as AssetType]" />
          </el-icon>
          <span v-else class="status-dot" :style="{ background: ASSET_STATE_COLORS[data.state as AssetState] }" />
          <span class="node-label">{{ node.label }}</span>
          <span v-if="data.children" class="node-count">({{ data.children.length }})</span>
        </div>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Plus, Delete } from '@element-plus/icons-vue'
import { useAssetsStore } from '@/stores/assets'
import { ASSET_TYPE_ICONS, ASSET_STATE_COLORS } from '@/types/asset'
import type { AssetNode, AssetType, AssetState } from '@/types/asset'

const emit = defineEmits<{
  select: [id: string]
  create: []
  viewDeleted: []
}>()

const store = useAssetsStore()
const searchQuery = ref('')

const selectedId = computed(() => store.selectedId)
const expandedKeys = computed(() => store.assetTree.map(n => n.id))

const treeData = computed(() => {
  if (!searchQuery.value) return store.assetTree
  return store.assetTree.map(group => ({
    ...group,
    children: group.children?.filter(child =>
      child.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    ),
  })).filter(g => g.children && g.children.length > 0)
})

function handleNodeClick(data: AssetNode) {
  if (!data.children) {
    emit('select', data.id)
    store.selectAsset(data.id)
  }
}

function handleCreate() {
  emit('create')
}

function handleViewDeleted() {
  emit('viewDeleted')
}
</script>

<style scoped>
.asset-tree {
  height: 100%;
  overflow: auto;
}

.tree-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
  align-items: center;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.tree-node.is-selected {
  color: var(--el-color-primary);
}

.type-icon {
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.node-label {
  flex: 1;
}

.node-count {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
