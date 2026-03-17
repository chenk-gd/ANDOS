<template>
  <el-dialog
    v-model="visible"
    title="已删除资产"
    width="700px"
    :close-on-click-modal="false"
    @open="loadDeletedAssets"
  >
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="deletedAssets.length === 0" class="empty-state">
      <el-empty description="暂无已删除资产" />
    </div>

    <div v-else class="deleted-assets-list">
      <el-table :data="deletedAssets" style="width: 100%">
        <el-table-column prop="name" label="资产名称" min-width="150" />
        <el-table-column prop="slug" label="标识符" min-width="120" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ ASSET_TYPE_LABELS[row.type as AssetType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="删除时间" width="160">
          <template #default="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              size="small"
              @click="handleRestore(row)"
            >
              恢复
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Asset, AssetType } from '@/types/asset'
import { ASSET_TYPE_LABELS } from '@/types/asset'
import { assetsApi } from '@/services/api'

interface Props {
  modelValue: boolean
  projectId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  restored: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const deletedAssets = ref<Asset[]>([])
const loading = ref(false)

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadDeletedAssets() {
  loading.value = true
  try {
    const response = await assetsApi.listDeleted(props.projectId)
    deletedAssets.value = response.data.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  } catch (error) {
    console.error('Failed to load deleted assets:', error)
    ElMessage.error('加载已删除资产失败')
  } finally {
    loading.value = false
  }
}

async function handleRestore(asset: Asset) {
  try {
    await ElMessageBox.confirm(
      `确定要恢复资产 "${asset.name}" 吗？`,
      '恢复确认',
      {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    await assetsApi.restore(asset.id)
    ElMessage.success('资产恢复成功')

    // Remove from list
    const index = deletedAssets.value.findIndex(a => a.id === asset.id)
    if (index > -1) {
      deletedAssets.value.splice(index, 1)
    }

    emit('restored')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to restore asset:', error)
      const message = error instanceof Error ? error.message : '恢复失败'
      ElMessage.error(message)
    }
  }
}
</script>

<style scoped>
.loading-state,
.empty-state {
  padding: 40px 0;
}

.deleted-assets-list {
  max-height: 400px;
  overflow-y: auto;
}
</style>
