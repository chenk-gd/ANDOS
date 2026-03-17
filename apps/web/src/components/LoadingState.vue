<template>
  <!-- 骨架屏模式 -->
  <div v-if="type === 'skeleton'" class="loading-state skeleton-mode" :class="{ fullscreen: fullscreen }">
    <el-skeleton
      :rows="rows"
      :animated="animated"
      :throttle="throttle"
    />
  </div>

  <!-- Spinner 模式 -->
  <div v-else-if="type === 'spinner'" class="loading-state spinner-mode" :class="{ fullscreen: fullscreen }">
    <div class="spinner-container">
      <el-icon class="spinner-icon" :size="size">
        <Loading />
      </el-icon>
      <p v-if="text" class="loading-text">{{ text }}</p>
    </div>
  </div>

  <!-- Dots 模式 -->
  <div v-else-if="type === 'dots'" class="loading-state dots-mode" :class="{ fullscreen: fullscreen }">
    <div class="dots-container">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <p v-if="text" class="loading-text">{{ text }}</p>
  </div>

  <!-- Circle 模式 -->
  <div v-else-if="type === 'circle'" class="loading-state circle-mode" :class="{ fullscreen: fullscreen }">
    <div class="circle-container">
      <div class="circle-spinner"></div>
      <p v-if="text" class="loading-text">{{ text }}</p>
    </div>
  </div>

  <!-- 遮罩模式 -->
  <div v-else-if="type === 'mask'" class="loading-mask" :class="{ visible: visible }">
    <div class="mask-content">
      <el-icon class="mask-spinner" :size="size">
        <Loading />
      </el-icon>
      <p v-if="text" class="mask-text">{{ text }}</p>
    </div>
  </div>

  <!-- 进度条模式 -->
  <div v-else-if="type === 'progress'" class="loading-state progress-mode" :class="{ fullscreen: fullscreen }">
    <div class="progress-container">
      <el-progress
        :percentage="percentage"
        :status="progressStatus"
        :stroke-width="strokeWidth"
        :type="progressType"
      />
      <p v-if="text" class="loading-text">{{ text }}</p>
      <p v-if="subText" class="sub-text">{{ subText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'

type LoadingType = 'skeleton' | 'spinner' | 'dots' | 'circle' | 'mask' | 'progress'
type ProgressType = 'line' | 'circle' | 'dashboard'

interface Props {
  // 加载类型
  type?: LoadingType
  // 是否全屏显示
  fullscreen?: boolean
  // 加载文字
  text?: string
  // 副文字
  subText?: string

  // Skeleton 相关
  rows?: number
  animated?: boolean
  throttle?: number

  // Spinner/Circle 相关
  size?: number

  // Mask 相关
  visible?: boolean

  // Progress 相关
  percentage?: number
  progressType?: ProgressType
  strokeWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'spinner',
  fullscreen: false,
  text: '加载中...',
  subText: '',
  rows: 5,
  animated: true,
  throttle: 0,
  size: 40,
  visible: true,
  percentage: 0,
  progressType: 'line',
  strokeWidth: 6,
})

// 进度条状态
const progressStatus = computed(() => {
  if (props.percentage >= 100) return 'success'
  return undefined
})
</script>

<style scoped>
/* 基础样式 */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.loading-state.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  z-index: 2000;
  flex-direction: column;
}

/* Spinner 模式 */
.spinner-mode .spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spinner-icon {
  animation: spin 1s linear infinite;
  color: var(--el-color-primary);
}

/* Dots 模式 */
.dots-mode {
  flex-direction: column;
  gap: 16px;
}

.dots-container {
  display: flex;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  background: var(--el-color-primary);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite both;
}

.dot:nth-child(1) {
  animation-delay: -0.32s;
}

.dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* Circle 模式 */
.circle-mode {
  flex-direction: column;
  gap: 16px;
}

.circle-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--el-border-color);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 遮罩模式 */
.loading-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
  z-index: 100;
  border-radius: inherit;
}

.loading-mask.visible {
  opacity: 1;
  visibility: visible;
}

.mask-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.mask-spinner {
  animation: spin 1s linear infinite;
  color: var(--el-color-primary);
}

.mask-text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* 进度条模式 */
.progress-mode {
  flex-direction: column;
  gap: 16px;
}

.progress-container {
  width: 100%;
  max-width: 400px;
  padding: 20px;
}

/* 文字样式 */
.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.sub-text {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
  margin-top: 4px;
}

/* 骨架屏样式调整 */
.skeleton-mode {
  padding: 16px;
}

.skeleton-mode.fullscreen {
  padding: 40px;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .loading-state.fullscreen {
    background: rgba(0, 0, 0, 0.9);
  }

  .loading-mask {
    background: rgba(0, 0, 0, 0.85);
  }
}
</style>
