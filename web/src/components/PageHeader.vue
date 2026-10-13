<!-- PageHeader:统一页头,支持渐变背景 / 面包屑 / 操作按钮 -->
<template>
  <header class="page-header" :class="{ 'is-hero': hero, 'is-glass': glass }">
    <div class="page-header-bg" v-if="hero || glass" />
    <div class="page-header-inner">
      <div class="page-header-text">
        <div v-if="breadcrumb?.length" class="page-header-crumb">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(c, i) in breadcrumb" :key="i" :to="c.to">
              {{ c.label }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="page-header-title-row">
          <div v-if="icon" class="page-header-icon" :class="iconTone">
            <el-icon :size="20"><component :is="icon" /></el-icon>
          </div>
          <div>
            <h1 class="page-header-title">{{ title }}</h1>
            <p v-if="sub" class="page-header-sub">
              <slot name="sub">{{ sub }}</slot>
            </p>
          </div>
        </div>
      </div>
      <div v-if="$slots.actions" class="page-header-actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  sub?: string
  icon?: any
  iconTone?: 'brand' | 'success' | 'warning' | 'danger' | 'info'
  hero?: boolean
  glass?: boolean
  breadcrumb?: { label: string; to?: any }[]
}>()
</script>

<style scoped>
.page-header {
  position: relative;
  margin-bottom: var(--fm-space-6);
  border-radius: var(--fm-radius-lg);
  overflow: hidden;
  isolation: isolate;
}
.page-header.is-hero { padding: 0; }
.page-header.is-glass {
  background: var(--fm-glass-bg);
  backdrop-filter: var(--fm-glass-blur);
  -webkit-backdrop-filter: var(--fm-glass-blur);
  border: 1px solid var(--fm-glass-border);
}
.page-header-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(800px 300px at 0% 0%, rgba(99,102,241,0.18), transparent 60%),
    radial-gradient(600px 240px at 100% 100%, rgba(139,92,246,0.15), transparent 60%),
    linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 100%);
  z-index: -1;
}
html.dark .page-header-bg {
  background:
    radial-gradient(800px 300px at 0% 0%, rgba(99,102,241,0.22), transparent 60%),
    radial-gradient(600px 240px at 100% 100%, rgba(139,92,246,0.20), transparent 60%);
}
.page-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--fm-space-4);
  padding: 24px 28px;
  flex-wrap: wrap;
}
.page-header.is-hero .page-header-inner {
  padding: 32px 32px;
}
.page-header-text { flex: 1; min-width: 0; }
.page-header-crumb {
  font-size: 12px;
  color: var(--fm-text-3);
  margin-bottom: 10px;
}
.page-header-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.page-header-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--fm-radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--fm-gradient-hero);
  color: #fff;
  box-shadow: 0 8px 20px -8px rgba(79,70,229,0.6);
  flex-shrink: 0;
}
.page-header-icon.tone-success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 8px 20px -8px rgba(16,185,129,0.6); }
.page-header-icon.tone-warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); box-shadow: 0 8px 20px -8px rgba(245,158,11,0.6); }
.page-header-icon.tone-danger  { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 8px 20px -8px rgba(239,68,68,0.6); }
.page-header-icon.tone-info    { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); box-shadow: 0 8px 20px -8px rgba(14,165,233,0.6); }

.page-header-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--fm-text-1);
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.page-header.is-hero .page-header-title {
  font-size: 28px;
}
.page-header-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--fm-text-2);
  line-height: 1.6;
}
.page-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .page-header-inner { flex-direction: column; align-items: flex-start; padding: 20px; }
  .page-header.is-hero .page-header-inner { padding: 24px 20px; }
  .page-header-title { font-size: 20px; }
  .page-header.is-hero .page-header-title { font-size: 22px; }
  .page-header-actions { width: 100%; }
  .page-header-actions > * { flex: 1; }
}
</style>
