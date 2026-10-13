<!-- ThemeToggle:亮/暗主题切换按钮 -->
<template>
  <button class="theme-toggle" :title="isDark ? '切换为亮色' : '切换为暗色'" @click="toggle">
    <transition name="theme-icon" mode="out-in">
      <el-icon v-if="isDark" :size="18" key="sun"><Sunny /></el-icon>
      <el-icon v-else :size="18" key="moon"><Moon /></el-icon>
    </transition>
  </button>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Sunny, Moon } from '@element-plus/icons-vue'

const isDark = ref(false)
const STORAGE_KEY = 'fm_theme'

function apply(dark: boolean) {
  isDark.value = dark
  if (dark) document.documentElement.classList.add('dark')
  else document.documentElement.classList.remove('dark')
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light') } catch { /* noop */ }
}

function toggle() {
  apply(!isDark.value)
}

onMounted(() => {
  let saved: string | null = null
  try { saved = localStorage.getItem(STORAGE_KEY) } catch { /* noop */ }
  if (saved === 'dark') apply(true)
  else if (saved === 'light') apply(false)
  else apply(window.matchMedia('(prefers-color-scheme: dark)').matches)
})
</script>

<style scoped>
.theme-toggle {
  width: 36px;
  height: 36px;
  border: 1px solid var(--fm-border);
  background: var(--fm-bg-elevated);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--fm-dur-base) var(--fm-ease);
  position: relative;
  overflow: hidden;
}
.theme-toggle:hover {
  color: var(--fm-brand-600);
  border-color: var(--fm-brand-300);
  transform: translateY(-1px);
  box-shadow: var(--fm-shadow-sm);
}
.theme-toggle:active { transform: translateY(0); }
.theme-icon-enter-active, .theme-icon-leave-active {
  transition: all var(--fm-dur-base) var(--fm-ease-spring);
  position: absolute;
}
.theme-icon-enter-from { opacity: 0; transform: rotate(-90deg) scale(0.6); }
.theme-icon-leave-to   { opacity: 0; transform: rotate(90deg) scale(0.6); }
</style>
