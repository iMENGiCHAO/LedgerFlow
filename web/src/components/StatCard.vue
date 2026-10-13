<!-- 统计卡:支持 6 种 brand color + trend -->
<template>
  <div class="stat-card" :class="[`tone-${tone}`]">
    <div class="stat-head">
      <div class="stat-icon">
        <el-icon v-if="icon" :size="20"><component :is="icon" /></el-icon>
        <slot v-else name="icon" />
      </div>
      <div v-if="trend" class="stat-trend" :class="trendClass">
        <el-icon :size="12">
          <CaretTop v-if="trend.dir === 'up'" />
          <CaretBottom v-else-if="trend.dir === 'down'" />
          <Minus v-else />
        </el-icon>
        <span>{{ trend.text }}</span>
      </div>
    </div>
    <div class="stat-label">{{ label }}</div>
    <div class="stat-value">
      <span v-if="prefix" class="stat-prefix">{{ prefix }}</span>
      <span class="stat-num">{{ displayValue }}</span>
      <span v-if="suffix" class="stat-suffix">{{ suffix }}</span>
    </div>
    <div v-if="sub" class="stat-sub">{{ sub }}</div>
    <div class="stat-glow" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'

const props = defineProps<{
  label: string
  value: number | string
  prefix?: string
  suffix?: string
  icon?: any
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'blue'
  sub?: string
  trend?: { dir: 'up' | 'down' | 'flat'; text: string }
  loading?: boolean
  formatter?: (v: number | string) => string
}>()

const displayValue = computed(() => {
  if (props.loading) return '—'
  if (props.formatter) return props.formatter(props.value)
  return String(props.value)
})

const trendClass = computed(() => {
  if (!props.trend) return ''
  if (props.trend.dir === 'up') return 'is-up'
  if (props.trend.dir === 'down') return 'is-down'
  return 'is-flat'
})
</script>

<style scoped>
.stat-card {
  position: relative;
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: var(--fm-radius-md);
  padding: 20px 22px 22px;
  box-shadow: var(--fm-shadow-sm);
  transition: all var(--fm-dur-base) var(--fm-ease);
  overflow: hidden;
  isolation: isolate;
}
.stat-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--tone-bg) 0%, transparent 60%);
  opacity: 0.6;
  z-index: -1;
  transition: opacity var(--fm-dur-base) var(--fm-ease);
}
.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--fm-shadow-card-hover);
  border-color: var(--tone-border);
}
.stat-card:hover::before { opacity: 0.9; }

.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--fm-radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tone-bg);
  color: var(--tone-color);
  box-shadow: 0 2px 8px -2px var(--tone-glow);
}
.stat-trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
}
.stat-trend.is-up { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.stat-trend.is-down { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }

.stat-label {
  font-size: 13px;
  color: var(--fm-text-2);
  font-weight: 500;
  letter-spacing: 0.01em;
}
.stat-value {
  margin-top: 8px;
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: var(--fm-text-1);
  line-height: 1.1;
}
.stat-prefix {
  font-size: 16px;
  font-weight: 600;
  color: var(--fm-text-2);
  margin-right: 2px;
}
.stat-num {
  font-size: 30px;
  font-weight: 700;
  font-family: var(--fm-font-num);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, var(--fm-text-1) 0%, color-mix(in oklab, var(--fm-text-1) 70%, transparent) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-suffix {
  font-size: 14px;
  font-weight: 500;
  color: var(--fm-text-3);
  margin-left: 2px;
}
.stat-sub {
  margin-top: 10px;
  font-size: 12px;
  color: var(--fm-text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-glow {
  position: absolute;
  right: -40px;
  bottom: -40px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--tone-glow);
  filter: blur(40px);
  opacity: 0.4;
  z-index: -1;
  transition: opacity var(--fm-dur-slow) var(--fm-ease);
}
.stat-card:hover .stat-glow { opacity: 0.7; }

/* tone 调色板 */
.tone-brand   { --tone-color: var(--fm-brand-600);  --tone-bg: rgba(99,102,241,0.10);  --tone-border: rgba(99,102,241,0.35);  --tone-glow: rgba(99,102,241,0.25); }
.tone-violet  { --tone-color: var(--fm-violet-600); --tone-bg: rgba(139,92,246,0.10);  --tone-border: rgba(139,92,246,0.35);  --tone-glow: rgba(139,92,246,0.25); }
.tone-blue    { --tone-color: var(--fm-blue-500);   --tone-bg: rgba(59,130,246,0.10);  --tone-border: rgba(59,130,246,0.35);  --tone-glow: rgba(59,130,246,0.25); }
.tone-success { --tone-color: var(--fm-success);    --tone-bg: var(--fm-success-soft);  --tone-border: rgba(16,185,129,0.35);  --tone-glow: rgba(16,185,129,0.25); }
.tone-warning { --tone-color: var(--fm-warning);    --tone-bg: var(--fm-warning-soft);  --tone-border: rgba(245,158,11,0.35);  --tone-glow: rgba(245,158,11,0.25); }
.tone-danger  { --tone-color: var(--fm-danger);     --tone-bg: var(--fm-danger-soft);   --tone-border: rgba(239,68,68,0.35);   --tone-glow: rgba(239,68,68,0.25); }
.tone-info    { --tone-color: var(--fm-info);       --tone-bg: var(--fm-info-soft);     --tone-border: rgba(14,165,233,0.35);  --tone-glow: rgba(14,165,233,0.25); }

html.dark .tone-brand   { --tone-color: var(--fm-brand-300); }
html.dark .tone-violet  { --tone-color: var(--fm-violet-300); }
html.dark .tone-blue    { --tone-color: var(--fm-blue-400); }
html.dark .tone-success { --tone-color: #34d399; }
html.dark .tone-warning { --tone-color: #fbbf24; }
html.dark .tone-danger  { --tone-color: #f87171; }
html.dark .tone-info    { --tone-color: #38bdf8; }
</style>
