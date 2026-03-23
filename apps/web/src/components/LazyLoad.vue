<template>
  <div ref="containerRef" class="lazy-container" :style="{ minHeight: minHeight + 'px' }">
    <div v-if="isVisible">
      <slot />
    </div>
    <div v-else class="lazy-placeholder">
      <el-skeleton :rows="skeletonRows" animated />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Props {
  minHeight?: number
  skeletonRows?: number
  rootMargin?: string
}

const props = withDefaults(defineProps<Props>(), {
  minHeight: 200,
  skeletonRows: 10,
  rootMargin: '100px',
})

const containerRef = ref<HTMLElement>()
const isVisible = ref(false)

let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!containerRef.value) return

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isVisible.value = true
          // Once visible, stop observing
          observer?.unobserve(entry.target)
        }
      })
    },
    {
      rootMargin: props.rootMargin,
      threshold: 0,
    }
  )

  observer.observe(containerRef.value)
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<style scoped>
.lazy-container {
  width: 100%;
}

.lazy-placeholder {
  padding: 16px;
}
</style>
