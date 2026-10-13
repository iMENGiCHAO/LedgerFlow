<template>
  <div class="bs-page">
    <PageHeader
      :icon="Notebook"
      icon-tone="brand"
      title="资产负债表"
      sub="财务状况左右对照表 · 资产总额恒等于负债及权益总额"
    >
      <template #actions>
        <el-select
          v-model="periodId"
          class="period-select"
          placeholder="请选择会计期间"
          :loading="periodLoading"
          @change="loadData"
        >
          <el-option v-for="p in periods" :key="p.id" :value="p.id" :label="periodLabel(p)" />
        </el-select>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button type="primary" :icon="Printer" :disabled="!hasData" @click="doPrint">打印</el-button>
      </template>
    </PageHeader>

    <SectionCard :padless="true" class="bs-card">
      <template #actions>
        <el-tag v-if="check" :type="check.balanced ? 'success' : 'danger'" effect="plain" class="check-pill">
          <el-icon :size="12"><CircleCheckFilled v-if="check.balanced" /><WarningFilled v-else /></el-icon>
          {{ check.balanced ? '试算平衡' : '借贷不平衡' }}
        </el-tag>
      </template>
      <template #title>
        <span>资产负债表</span>
        <span v-if="currentPeriod" class="bs-period">{{ currentPeriod.year }} 年 {{ currentPeriod.month }} 月</span>
      </template>

      <el-table v-loading="loading" :data="mergedRows" class="bs-table">
        <el-table-column label="资产项目" min-width="220">
          <template #default="{ row }">
            <div
              v-if="row.l.rowName"
              :class="['bs-cell', { 'is-bold': row.l.bold }]"
              :style="{ paddingLeft: toNum(row.l.indent) * 20 + 'px' }"
            >
              {{ row.l.rowName }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" align="right" min-width="130">
          <template #default="{ row }">
            <span v-if="row.l.rowName" class="num-cell">{{ fmtMoney(row.l.periodValue) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="负债及权益项目" min-width="220">
          <template #default="{ row }">
            <div
              v-if="row.r.rowName"
              :class="['bs-cell', { 'is-bold': row.r.bold }]"
              :style="{ paddingLeft: toNum(row.r.indent) * 20 + 'px' }"
            >
              {{ row.r.rowName }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" align="right" min-width="130">
          <template #default="{ row }">
            <span v-if="row.r.rowName" class="num-cell">{{ fmtMoney(row.r.periodValue) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无数据" description="请选择会计期间后查询" />
        </template>
      </el-table>

      <el-alert
        v-if="check"
        class="balance-alert"
        :type="check.balanced ? 'success' : 'error'"
        :closable="false"
        show-icon
        :title="balanceTitle"
      />
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Printer, Notebook, CircleCheckFilled, WarningFilled, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { periodList, reportBalanceSheet } from '@/api/modules'
import { fmtMoney, PERIOD_STATUS, printHtml, toNum } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const auth = useAuthStore()

const periods = ref<any[]>([])
const periodId = ref<number | null>(null)
const periodLoading = ref(false)
const exporting = ref(false)

async function onExport() {
  if (!periodId.value) {
    ElMessage.warning('请先选择会计期间')
    return
  }
  exporting.value = true
  try {
    await exportExcel({
      url: '/reports/balance-sheet',
      filename: '资产负债表',
      params: { periodId: periodId.value },
      loadingText: '资产负债表 Excel',
    })
  } finally {
    exporting.value = false
  }
}

const loading = ref(false)
const rows = ref<any[]>([])
const check = ref<any>(null)

const currentPeriod = computed(() => periods.value.find((p: any) => p.id === periodId.value) || null)
const hasData = computed(() => rows.value.length > 0)

function periodLabel(p: any): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}(${PERIOD_STATUS[p.status] ?? '未知状态'})`
}

async function loadPeriods() {
  periodLoading.value = true
  try {
    const res: any = await periodList()
    periods.value = res?.list || []
    if (periods.value.length && !periodId.value) {
      periodId.value = periods.value[periods.value.length - 1].id
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    periodLoading.value = false
  }
}

async function loadData() {
  if (!periodId.value) return
  loading.value = true
  try {
    const res: any = await reportBalanceSheet(periodId.value as number)
    rows.value = res?.rows || []
    check.value = res?.balanceCheck || null
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function splitRows(): { left: any[]; right: any[] } {
  const idx = rows.value.findIndex((r: any) => r.rowKey === 'total_asset')
  if (idx >= 0) {
    return { left: rows.value.slice(0, idx + 1), right: rows.value.slice(idx + 1) }
  }
  return { left: rows.value.slice(), right: [] }
}

const leftRows = computed<any[]>(() => splitRows().left)
const rightRows = computed<any[]>(() => splitRows().right)

const mergedRows = computed(() => {
  const len = Math.max(leftRows.value.length, rightRows.value.length)
  const out: { l: any; r: any }[] = []
  for (let i = 0; i < len; i++) {
    out.push({ l: leftRows.value[i] || {}, r: rightRows.value[i] || {} })
  }
  return out
})

const balanceTitle = computed(() => {
  if (!check.value) return ''
  const a = fmtMoney(check.value.asset)
  const b = fmtMoney(check.value.liabilityEquity)
  return check.value.balanced
    ? `√ 试算平衡:资产总额 = 负债及权益总额 ${a}`
    : `借贷不平衡:资产总额 ${a},负债及权益总额 ${b}`
})

// ---------- 打印 ----------
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
}

function nameCell(r: any): string {
  if (!r || !r.rowName) return '<td></td>'
  const pad = toNum(r.indent) * 20 + 8
  const nm = esc(r.rowName)
  const inner = r.bold ? `<b style="padding-left:${pad}px;display:inline-block">${nm}</b>` : `<span style="padding-left:${pad}px;display:inline-block">${nm}</span>`
  return `<td>${inner}</td>`
}

function amtCell(r: any): string {
  if (!r || !r.rowName) return '<td class="r"></td>'
  return `<td class="r">${esc(fmtMoney(r.periodValue))}</td>`
}

function doPrint() {
  const sub = `${auth.currentTenantName || '未指定账套'}　会计期间:${currentPeriod.value ? `${currentPeriod.value.year} 年 ${currentPeriod.value.month} 月` : '-'}`
  const len = Math.max(leftRows.value.length, rightRows.value.length)
  let trs = ''
  for (let i = 0; i < len; i++) {
    trs += `<tr>${nameCell(leftRows.value[i])}${amtCell(leftRows.value[i])}${nameCell(rightRows.value[i])}${amtCell(rightRows.value[i])}</tr>`
  }
  const foot = check.value
    ? check.value.balanced
      ? `<p class="ok">√ 试算平衡:资产总额 = 负债及权益总额 ${esc(fmtMoney(check.value.asset))}</p>`
      : `<p class="bad">× 借贷不平衡:资产总额 ${esc(fmtMoney(check.value.asset))},负债及权益总额 ${esc(fmtMoney(check.value.liabilityEquity))}</p>`
    : ''
  const html = `
<h1>资产负债表</h1>
<p class="sub">${esc(sub)}</p>
<table>
  <thead><tr><th style="width:34%">资产项目</th><th style="width:16%" class="r">金额</th><th style="width:34%">负债及权益项目</th><th style="width:16%" class="r">金额</th></tr></thead>
  <tbody>${trs}</tbody>
</table>
${foot}`
  printHtml('资产负债表', html)
}

onMounted(async () => {
  await loadPeriods()
  await loadData()
})
</script>

<style scoped>
.bs-page { display: flex; flex-direction: column; gap: 18px; }
.period-select { width: 240px; }
.bs-period {
  margin-left: 12px;
  font-size: 12px;
  color: var(--fm-text-3);
  font-weight: 400;
  font-family: var(--fm-font-num);
  font-variant-numeric: tabular-nums;
}
.check-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.bs-cell { padding: 8px 0; line-height: 1.5; }
.bs-cell.is-bold { font-weight: 700; color: var(--fm-text-1); }
.balance-alert {
  margin: 16px 24px 24px;
  border-radius: var(--fm-radius-md);
  border: none;
  font-weight: 500;
}
.balance-alert.el-alert--success { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.balance-alert.el-alert--error { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }
.balance-alert :deep(.el-alert__title), .balance-alert :deep(.el-alert__icon) { color: inherit; }
</style>
