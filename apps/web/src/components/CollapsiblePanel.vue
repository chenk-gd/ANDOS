<template>
  <div class="collapsible-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header" @click="toggle">
      <slot name="title">
        <span class="title">{{ title }}</span>
      </slot>
      <el-button
        v-if="collapsible"
        class="collapse-btn"
        :icon="isCollapsed ? ArrowRight : ArrowDown"
        size="small"
        circle
        text
        @click.stop="toggle"
      />
    </div>
    <div v-show="!isCollapsed" class="panel-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowDown } from '@element-plus/icons-vue'

interface Props {
  title?: string
  collapsible?: boolean
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsible: true,
  collapsed: false,
})

const emit = defineEmits<{
  collapse: [value: boolean]
}>()

const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit('collapse', value)
})

function toggle() {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value
  }
}
</script>

<style scoped>
.collapsible-panel {
  border-bottom: 1px solid var(--border-color);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background: var(--bg-secondary);
}

.title {
  font-weight: 500;
  color: var(--text-primary);
}

.panel-body {
  padding: 0 16px 16px;
}

.collapsed .panel-header {
  border-bottom: none;
}
</style>
