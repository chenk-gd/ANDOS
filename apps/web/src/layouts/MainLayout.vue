<template>
  <div class="main-layout" :class="{ 'dark': isDark }">
    <header class="header-bar">
      <div class="logo">ANDOS</div>
      <div class="header-actions">
        <el-button @click="toggleTheme" :icon="isDark ? Sunny : Moon" circle />
      </div>
    </header>

    <div class="layout-body">
      <aside class="left-panel" :class="{ collapsed: layoutStore.leftCollapsed }">
        <div class="panel-content">
          <slot name="left" />
        </div>
        <div class="resize-handle" @mousedown="startResize('left')" />
      </aside>

      <main class="center-panel">
        <slot name="center" />
      </main>

      <aside class="right-panel" :class="{ collapsed: layoutStore.rightCollapsed }">
        <div class="panel-content">
          <slot name="right" />
        </div>
        <div class="resize-handle" @mousedown="startResize('right')" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sunny, Moon } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'

const layoutStore = useLayoutStore()
const isDark = ref(false)

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
}

function startResize(panel: 'left' | 'right') {
  console.log('Resize', panel)
}
</script>

<style scoped>
.main-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header-bar {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.layout-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel,
.right-panel {
  width: var(--panel-width);
  min-width: var(--panel-min-width);
  max-width: var(--panel-max-width);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
}

.left-panel.collapsed,
.right-panel.collapsed {
  width: 40px;
  min-width: 40px;
}

.center-panel {
  flex: 1;
  background: var(--bg-secondary);
  overflow: auto;
}

.panel-content {
  flex: 1;
  overflow: auto;
}

.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle:hover {
  background: var(--border-color);
}
</style>
