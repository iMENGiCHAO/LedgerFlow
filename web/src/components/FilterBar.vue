<!-- FilterBar:统一筛选区,支持响应式堆叠 + 简洁样式 -->
<template>
  <div class="filter-bar" :class="{ 'is-embedded': embedded }">
    <slot />
    <div v-if="slots.extra || $slots.extra" class="filter-extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSlots } from 'vue'
const slots = useSlots()
defineProps<{ embedded?: boolean }>()
</script>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-md);
  border: 1px solid var(--fm-border-soft);
  margin-bottom: var(--fm-space-4);
}
.filter-bar.is-embedded { background: transparent; border: none; padding: 0; }

.filter-extra {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (max-width: 767px) {
  .filter-bar { flex-direction: column; align-items: stretch; padding: 14px; }
  .filter-bar :deep(.el-select),
  .filter-bar :deep(.el-input),
  .filter-bar :deep(.el-input-number),
  .filter-bar :deep(.el-date-editor) { width: 100% !important; }
  .filter-extra { width: 100%; margin-left: 0; }
}
</style>
