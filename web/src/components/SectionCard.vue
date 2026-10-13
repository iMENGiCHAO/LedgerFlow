<!-- SectionCard:统一的卡片容器,带标题/副标题/操作区 -->
<template>
  <section class="section-card" :class="{ 'is-padless': padless, 'is-glass': glass, 'is-brand': brand }">
    <header v-if="title || $slots.title || $slots.actions" class="section-head">
      <div class="section-head-text">
        <div class="section-title-row">
          <h3 v-if="title || $slots.title" class="section-title">
            <slot name="title">{{ title }}</slot>
          </h3>
          <el-tag v-if="badge" :type="badge.type" size="small" effect="plain">{{ badge.text }}</el-tag>
        </div>
        <p v-if="sub" class="section-sub">{{ sub }}</p>
      </div>
      <div v-if="$slots.actions" class="section-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="section-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  sub?: string
  badge?: { text: string; type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' }
  padless?: boolean
  glass?: boolean
  brand?: boolean
}>()
</script>

<style scoped>
.section-card {
  position: relative;
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: var(--fm-radius-md);
  box-shadow: var(--fm-shadow-sm);
  transition: box-shadow var(--fm-dur-base) var(--fm-ease);
}
.section-card:hover { box-shadow: var(--fm-shadow-card-hover); }
.section-card.is-glass {
  background: var(--fm-glass-bg);
  backdrop-filter: var(--fm-glass-blur);
  -webkit-backdrop-filter: var(--fm-glass-blur);
  border-color: var(--fm-glass-border);
}
.section-card.is-brand {
  background: var(--fm-gradient-brand-soft);
  border-color: rgba(99,102,241,0.25);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--fm-space-3);
  padding: 20px 24px 14px;
  border-bottom: 1px solid var(--fm-border-soft);
}
.section-card.is-padless .section-head { padding-bottom: 16px; }
.section-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--fm-text-1);
  letter-spacing: -0.01em;
}
.section-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fm-text-3);
  font-weight: 400;
}
.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.section-body { padding: 20px 24px 24px; }
.section-card.is-padless .section-body { padding: 0; }
</style>
