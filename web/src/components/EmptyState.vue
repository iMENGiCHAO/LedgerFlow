<!-- EmptyState:增强型空状态 -->
<template>
  <div class="empty-state" :class="{ 'is-compact': compact }">
    <div class="empty-illust">
      <slot name="icon">
        <el-icon :size="48"><DocumentRemove /></el-icon>
      </slot>
    </div>
    <div class="empty-text">
      <div class="empty-title">
        <slot name="title">{{ title }}</slot>
      </div>
      <div v-if="description || $slots.description" class="empty-desc">
        <slot name="description">{{ description }}</slot>
      </div>
    </div>
    <div v-if="$slots.action" class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { DocumentRemove } from '@element-plus/icons-vue'
defineProps<{ title?: string; description?: string; compact?: boolean }>()
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 12px;
}
.empty-state.is-compact { padding: 32px 16px; }
.empty-illust {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--fm-bg-muted);
  color: var(--fm-text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.empty-illust::after {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: var(--fm-bg-muted);
  opacity: 0.3;
  z-index: -1;
  filter: blur(12px);
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--fm-text-1);
}
.empty-desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--fm-text-3);
  line-height: 1.6;
  max-width: 360px;
}
.empty-action { margin-top: 8px; }
</style>
