<template>
  <div class="dashboard">
    <!-- 英雄页头 -->
    <PageHeader
      hero
      :icon="Odometer"
      icon-tone="brand"
      :title="`您好,${auth.realName}`"
      :sub="`数据截至 ${summary?.asOf || '—'} · 资金与往来为实时口径,损益为最近已记账期间`"
    >
      <template #actions>
        <el-button :icon="Refresh" circle @click="load" />
        <el-button type="primary" :icon="Plus" @click="$router.push('/vouchers/new')">录入凭证</el-button>
      </template>
    </PageHeader>

    <!-- 快速上手引导(新用户友好) -->
    <div class="quick-start-card">
      <div class="qs-icon"><el-icon :size="22"><Reading /></el-icon></div>
      <div class="qs-text">
        <div class="qs-title">第一次使用?</div>
        <div class="qs-desc">查看完整的使用说明(按角色分) — 告诉您每一步怎么操作</div>
      </div>
      <el-button type="primary" :icon="Reading" @click="$router.push('/help')">打开使用说明</el-button>
    </div>

    <!-- 顶部统计卡 -->
    <div class="fm-stats-grid">
      <StatCard
        label="资金头寸"
        :value="summary ? fmtMoney(summary.cashPosition ?? 0) : '—'"
        :icon="Wallet"
        tone="brand"
        :loading="loading"
        sub="现金 + 银行存款实时余额"
      />
      <StatCard
        label="应收账款"
        :value="summary ? fmtMoney(summary.receivable?.outstanding ?? 0) : '—'"
        :icon="Money"
        tone="warning"
        :sub="overdueSub"
      />
      <StatCard
        label="应付账款"
        :value="summary ? fmtMoney(summary.payable?.outstanding ?? 0) : '—'"
        :icon="Coin"
        tone="danger"
        :loading="loading"
        sub="供应商未结算金额"
      />
      <StatCard
        :label="`本期收入(${summary?.asOf ?? '—'})`"
        :value="summary ? fmtMoney(summary.currentPeriod?.revenue ?? 0) : '—'"
        :icon="TrendCharts"
        tone="success"
        :loading="loading"
        sub="最近已记账期间"
      />
      <StatCard
        label="本期净利润"
        :value="summary ? fmtMoney(summary.currentPeriod?.netProfit ?? 0) : '—'"
        :icon="DataAnalysis"
        :tone="profitTone"
        :loading="loading"
        :sub="profitSub"
      />
      <div class="stat-card stat-todo" :class="`tone-${todoTone}`">
        <div class="stat-head">
          <div class="stat-icon">
            <el-icon :size="20"><Bell /></el-icon>
          </div>
          <span class="todo-tag">实时</span>
        </div>
        <div class="stat-label">待办事项</div>
        <div class="todo-list">
          <div
            v-for="t in todoItems"
            :key="t.label"
            class="todo-line"
            :class="{ 'has-todo': t.count > 0 }"
            @click="goTodo(t.path)"
          >
            <span class="todo-label">
              <el-icon :size="12" class="todo-dot"><CircleCheckFilled v-if="t.count > 0" /><CirclePlus v-else /></el-icon>
              {{ t.label }}
            </span>
            <span class="todo-badge">{{ t.count }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-row">
      <SectionCard title="近 12 个月收支趋势" sub="单位:元" class="chart-card">
        <div ref="trendRef" class="chart chart-lg" />
        <EmptyState
          v-if="!loading && !(summary?.trend?.length)"
          title="暂无趋势数据"
          description="录入凭证并审核后,这里会展示近 12 个月的收支曲线"
        />
      </SectionCard>
      <SectionCard title="本期费用 TOP5 科目" sub="单位:元" class="chart-card">
        <div ref="topRef" class="chart chart-lg" />
        <EmptyState
          v-if="!loading && !(summary?.topExpenses?.length)"
          title="暂无费用数据"
          description="本期尚无费用类凭证记录"
        />
      </SectionCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from '@/utils/echarts'
import type { EChartsInstance } from '@/utils/echarts'
import {
  Money, Wallet, Coin, TrendCharts, Bell, Refresh, Plus, Odometer, Reading,
  DataAnalysis, CircleCheckFilled, CirclePlus,
} from '@element-plus/icons-vue'
import { dashboardSummary } from '@/api/modules'
import { fmtMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatCard from '@/components/StatCard.vue'
import SectionCard from '@/components/SectionCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const summary = ref<any>(null)

const trendRef = ref<HTMLDivElement>()
const topRef = ref<HTMLDivElement>()
let trendChart: EChartsInstance | null = null
let topChart: EChartsInstance | null = null

const isDark = computed(() => document.documentElement.classList.contains('dark'))

const profit = computed(() => Number(summary.value?.currentPeriod?.netProfit ?? 0))
const profitTone = computed(() => (profit.value >= 0 ? 'success' : 'danger') as const)
const profitSub = computed(() =>
  profit.value >= 0 ? '盈利状态良好,继续保持' : '本期亏损,关注成本结构',
)

const overdueSub = computed(() => {
  const od = Number(summary.value?.receivable?.overdue ?? 0)
  if (od > 0) return `其中逾期 ¥ ${fmtMoney(od)} · 需催收`
  return '当前无逾期款项'
})

const todoItems = computed(() => [
  { label: '待审核凭证', count: Number(summary.value?.todos?.pendingVouchers ?? 0), path: '/vouchers' },
  {
    label: '待处理报销',
    count: Number(summary.value?.todos?.pendingClaims ?? 0),
    path: auth.hasPerm('expense:approve') ? '/expense/approve' : '/expense/mine',
  },
])

const todoTone = computed(() => {
  const c = todoItems.value.reduce((a, t) => a + t.count, 0)
  if (c === 0) return 'success'
  if (c > 5) return 'danger'
  return 'warning'
}) as unknown as 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'blue'

function goTodo(path: string) {
  router.push(path)
}

/* ==================== 主题感知 ==================== */
const chartTextColor = computed(() => (isDark.value ? '#94a3b8' : '#6b7280'))
const chartGridColor = computed(() => (isDark.value ? '#1f2940' : '#f1f5f9'))
const chartAxisColor = computed(() => (isDark.value ? '#334155' : '#e2e8f0'))
const tooltipBg = computed(() => (isDark.value ? '#1c2440' : '#ffffff'))
const tooltipBorder = computed(() => (isDark.value ? '#334155' : '#e2e8f0'))

function renderTrend(trend: any[]) {
  if (!trendRef.value) return
  trendChart = trendChart || echarts.init(trendRef.value)
  const months = trend.map((t) => t.month)
  trendChart.setOption({
    color: ['#6366f1', '#f59e0b'],
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg.value,
      borderColor: tooltipBorder.value,
      borderWidth: 1,
      textStyle: { color: chartTextColor.value, fontSize: 12 },
      padding: [10, 14],
      valueFormatter: (v: number) => `¥ ${fmtMoney(v)}`,
    },
    legend: {
      data: ['收入', '支出'],
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 6,
      textStyle: { color: chartTextColor.value },
    },
    grid: { left: 8, right: 16, top: 36, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: months,
      boundaryGap: false,
      axisLine: { lineStyle: { color: chartAxisColor.value } },
      axisTick: { show: false },
      axisLabel: { color: chartTextColor.value, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: chartTextColor.value,
        fontSize: 11,
        formatter: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)),
      },
      splitLine: { lineStyle: { color: chartGridColor.value, type: 'dashed' } },
    },
    series: [
      {
        name: '收入',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        symbol: 'circle',
        lineStyle: { width: 2.5, color: '#6366f1' },
        itemStyle: { color: '#6366f1', borderColor: '#fff', borderWidth: 2 },
        data: trend.map((t) => Number(t.revenue)),
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(99,102,241,0.28)' },
            { offset: 1, color: 'rgba(99,102,241,0.00)' },
          ]),
        },
      },
      {
        name: '支出',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        symbol: 'circle',
        lineStyle: { width: 2.5, color: '#f59e0b' },
        itemStyle: { color: '#f59e0b', borderColor: '#fff', borderWidth: 2 },
        data: trend.map((t) => Number(t.expense)),
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245,158,11,0.22)' },
            { offset: 1, color: 'rgba(245,158,11,0.00)' },
          ]),
        },
      },
    ],
  })
}

function renderTop(topExpenses: any[]) {
  if (!topRef.value) return
  topChart = topChart || echarts.init(topRef.value)
  const rows = [...(topExpenses || [])].reverse()
  topChart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: tooltipBg.value,
      borderColor: tooltipBorder.value,
      borderWidth: 1,
      textStyle: { color: chartTextColor.value, fontSize: 12 },
      padding: [10, 14],
      valueFormatter: (v: number) => `¥ ${fmtMoney(v)}`,
    },
    grid: { left: 8, right: 36, top: 10, bottom: 0, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: chartTextColor.value,
        fontSize: 11,
        formatter: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)),
      },
      splitLine: { lineStyle: { color: chartGridColor.value, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: chartTextColor.value, fontSize: 12 },
    },
    series: [
      {
        name: '费用金额',
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#a5b4fc' },
            { offset: 1, color: '#6366f1' },
          ]),
        },
        label: {
          show: true,
          position: 'right',
          formatter: (p: { value: number }) => fmtMoney(p.value),
          fontSize: 11,
          color: chartTextColor.value,
        },
        data: rows.map((r) => Number(r.amount)),
      },
    ],
  })
}

function onResize() {
  trendChart?.resize()
  topChart?.resize()
}

let darkObserver: MutationObserver | null = null

async function load() {
  loading.value = true
  try {
    const data: any = await dashboardSummary()
    summary.value = data
    await nextTick()
    renderTrend(data?.trend || [])
    renderTop(data?.topExpenses || [])
    onResize()
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
  // 监听暗色切换,重绘图表
  darkObserver = new MutationObserver(() => {
    if (summary.value) {
      renderTrend(summary.value?.trend || [])
      renderTop(summary.value?.topExpenses || [])
    }
  })
  darkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  trendChart?.dispose()
  topChart?.dispose()
  darkObserver?.disconnect()
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.quick-start-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.06) 100%);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: 12px;
  transition: all 0.2s;
}
.quick-start-card:hover {
  border-color: rgba(99,102,241,0.4);
  box-shadow: 0 4px 16px rgba(99,102,241,0.1);
}
.qs-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(99,102,241,0.3);
}
.qs-text { flex: 1; min-width: 0; }
.qs-title { font-weight: 600; color: var(--fm-text-primary, #1e293b); margin-bottom: 2px; }
.qs-desc { font-size: 13px; color: var(--fm-text-muted, #64748b); }

/* 待办卡(独立的样式,与其他统计卡协调) */
.stat-todo {
  display: flex;
  flex-direction: column;
  padding: 20px 22px 22px;
}
.stat-todo .stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.stat-todo .stat-icon {
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
.todo-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--tone-color);
  background: var(--tone-bg);
  padding: 2px 8px;
  border-radius: var(--fm-radius-pill);
}
.stat-todo .stat-label {
  font-size: 13px;
  color: var(--fm-text-2);
  font-weight: 500;
  letter-spacing: 0.01em;
}
.todo-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.todo-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--fm-radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--fm-text-1);
  background: var(--fm-bg-muted);
  border: 1px solid transparent;
  transition: all var(--fm-dur-base) var(--fm-ease);
}
.todo-line:hover {
  border-color: var(--fm-border-soft);
  background: var(--fm-bg-elevated);
  transform: translateX(2px);
  box-shadow: var(--fm-shadow-xs);
}
.todo-line.has-todo {
  background: var(--fm-bg-elevated);
  border-color: var(--tone-border);
}
.todo-label { display: inline-flex; align-items: center; gap: 8px; }
.todo-dot { color: var(--fm-text-3); }
.todo-line.has-todo .todo-dot { color: var(--tone-color); }
.todo-badge {
  min-width: 26px;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--fm-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--fm-bg-elevated);
  color: var(--fm-text-3);
  border: 1px solid var(--fm-border-soft);
}
.todo-line.has-todo .todo-badge {
  background: var(--tone-color);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px -2px var(--tone-glow);
}

/* tone 调色板 */
.tone-brand   { --tone-color: var(--fm-brand-600);  --tone-bg: rgba(99,102,241,0.10);  --tone-border: rgba(99,102,241,0.30);  --tone-glow: rgba(99,102,241,0.25); }
.tone-warning { --tone-color: var(--fm-warning-ink); --tone-bg: var(--fm-warning-soft);  --tone-border: rgba(245,158,11,0.30);  --tone-glow: rgba(245,158,11,0.25); }
.tone-success { --tone-color: var(--fm-success-ink); --tone-bg: var(--fm-success-soft);  --tone-border: rgba(16,185,129,0.30);  --tone-glow: rgba(16,185,129,0.25); }
.tone-danger  { --tone-color: var(--fm-danger-ink);  --tone-bg: var(--fm-danger-soft);   --tone-border: rgba(239,68,68,0.30);   --tone-glow: rgba(239,68,68,0.25); }
html.dark .tone-brand   { --tone-color: var(--fm-brand-300); }
html.dark .tone-warning { --tone-color: #fbbf24; }
html.dark .tone-success { --tone-color: #34d399; }
html.dark .tone-danger  { --tone-color: #f87171; }

/* 图表区 */
.chart-row {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 20px;
}
@media (max-width: 1023px) { .chart-row { grid-template-columns: 1fr; } }
.chart { width: 100%; }
.chart-lg { height: 340px; }
@media (max-width: 1023px) { .chart-lg { height: 280px; } }
</style>
