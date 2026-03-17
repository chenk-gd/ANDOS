import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayoutStore = defineStore('layout', () => {
  const leftCollapsed = ref(false)
  const rightCollapsed = ref(false)
  const activeTab = ref<'form' | 'dag'>('form')

  function toggleLeft() {
    leftCollapsed.value = !leftCollapsed.value
  }

  function toggleRight() {
    rightCollapsed.value = !rightCollapsed.value
  }

  return {
    leftCollapsed,
    rightCollapsed,
    activeTab,
    toggleLeft,
    toggleRight,
  }
})
