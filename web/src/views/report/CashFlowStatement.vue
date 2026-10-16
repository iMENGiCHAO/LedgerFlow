<template>
  <div class="cf-page">
    <PageHeader
      :icon="Money"
      icon-tone="brand"
      title="现金流量表"
      sub="收付实现制现金流动 · 经营 / 投资 / 筹资三大活动 · 自动勾稽期初期末余额"
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

    <SectionCard :padless="true" class="cf-card">
      <template #actions>
        <el-tag v-if="check" :type="check.balanced ? 'success' : 'danger'" effect="plain" class="check-pill">
          <el-icon :size="12"><CircleCheckFilled v-if="check.balanced" /><WarningFilled v-else /></el-icon>
          {{ check.balanced ? '勾稽平衡' : '勾稽差异 ' + fmtMoney(check.delta) }}
        </el-tag>
      </template>
      <template #title>
        <span>现金流量表</span>
        <span v-if="currentPeriod" class="cf-period">{{ currentPeriod.year }} 年 {{ currentPeriod.month }} 月</span>
      </template>

      <el-table v-loading="loading" :data="rows" class="cf-table" :row-class-name="rowClass">
        <el-table-column label="行次" width="64" align="center">
          <template #default="{ row }">
            <span class="num-cell">{{ row.no }}</span>
          </template>
        </el-table-column>
        <el-table-column label="项目" min-width="300">
          <template #default="{ row }">
            <div :class="['cf-cell', { 'is-bold': row.bold }]">
              <span v-if="isSectionStart(row)" class="cf-section">{{ sectionTitle(row) }}</span>
              <span :style="{ marginLeft: (isSectionStart(row) ? 0 : indentOf(row)) + 'px' }">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="本期金额" align="right" min-width="140">
          <template #default="{ row }">
            <span :class="['num-cell', { 'is-neg': row.periodValue < 0 }]">{{ fmtMoney(row.periodValue) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="本年累计" align="right" min-width="140">
          <template #default="{ row }">
            <span :class="['num-cell', { 'is-neg': row.ytdValue < 0 }]">{{ fmtMoney(row.ytdValue) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无数据" description="请选择会计期间后查询" />
        </template>
      </el-table>

      <el-alert
        v-if="check"
        class="cf-alert"
        :type="check.balanced ? 'success' : 'error'"
        :closable="false"
        show-icon
        :title="`净增加额 ${fmtMoney(netIncrease)} = 期末现金 ${fmtMoney(endCash)} - 期初现金 ${fmtMoney(beginCash)}${check.balanced ? ' · 勾稽一致' : ' · 存在未归集差异,请核对未分类明细'}`"
      />

      <el-collapse v-if="unmapped.length" class="cf-unmapped">
        <el-collapse-item :title="`未自动归集的对方科目(${unmapped.length} 项,已计入「其他经营」)`">
          <el-table :data="unmapped" size="small">
            <el-table-column prop="code" label="科目编码" width="100" />
            <el-table-column prop="name" label="科目名称" min-width="160" />
            <el-table-column label="方向" width="80">
              <template #default="{ row }">{{ row.direction === 'inflow' ? '流入' : '流出' }}</template>
            </el-table-column>
            <el-table-column label="金额" align="right" min-width="120">
              <template #default="{ row }">
                <span class="num-cell">{{ fmtMoney(row.amount) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Printer, Money, CircleCheckFilled, WarningFilled, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { periodList, reportCashFlow } from '@/api/modules'
import { fmtMoney, PERIOD_STATUS, printHtml } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const periods = ref<any[]>([])
const periodId = ref<number | null>(null)
const periodLoading = ref(false)
const exporting = ref(false)
const loading = ref(false)

const rows = ref<any[]>([])
const check = ref<any>(null)
const unmapped = ref<any[]>([])
const beginCash = ref(0)
const endCash = ref(0)
const netIncrease = ref(0)

const currentPeriod = computed(() => periods.value.find((p: any) => p.id === periodId.value) || null)
const hasData = computed(() => rows.value.length > 0)

function periodLabel(p: any): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}(${PERIOD_STATUS[p.status] ?? '未知状态'})`
}

function isSectionStart(row: any): boolean {
  if (row.kind !== 'inflow' && row.kind !== 'outflow') return false
  if (row.no === 1) return true
  const prev = rows.value.find((r: any) => r.no === row.no - 1)
  return !prev || prev.section !== row.section || prev.kind !== row.kind
}

const SECTION_TITLES: Record<string, string> = {
  operating: '一、经营活动产生的现金流量',
  investing: '二、投资活动产生的现金流量',
  financing: '三、筹资活动产生的现金流量',
}

function sectionTitle(row: any): string {
  const kind = row.kind === 'inflow' ? '现金流入:' : '现金流出:'
  return SECTION_TITLES[row.section] + kind
}

function indentOf(row: any): number {
  if (row.kind === 'subtotal' || row.kind === 'net') return 12
  return isSectionStart(row) ? 12 : 24
}

function rowClass({ row }: { row: any }): string {
  if (row.key === 'f0430' || row.key === 'f0432') return 'cf-row-total'
  if (row.kind === 'net') return 'cf-row-net'
  return ''
}

async function onExport() {
  if (!currentPeriod.value) {
    ElMessage.warning('请先选择会计期间')
    return
  }
  exporting.value = true
  try {
    await exportExcel({
      url: '/reports/cash-flow',
      filename: '现金流量表',
      params: { year: currentPeriod.value.year, month: currentPeriod.value.month },
      loadingText: '现金流量表 Excel',
    })
  } finally {
    exporting.value = false
  }
}


/** 默认期间:最早未结账(开启中)期间;无开启期间则取最后一项 */
function pickDefaultPeriodId(list: any[]): number | null {
  if (!list.length) return null
  const open = list.filter((p: any) => p.status === 1)
  if (open.length) {
    return open.reduce((a: any, b: any) => (a.year * 12 + a.month <= b.year * 12 + b.month ? a : b)).id
  }
  return list[list.length - 1].id
}

async function loadPeriods() {
  periodLoading.value = true
  try {
    const res: any = await periodList()
    periods.value = res?.list || []
    if (periods.value.length && !periodId.value) {
      periodId.value = pickDefaultPeriodId(periods.value)
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    periodLoading.value = false
  }
}

async function loadData() {
  const p = currentPeriod.value
  if (!p) return
  loading.value = true
  try {
    const res: any = await reportCashFlow(p.year, p.month)
    rows.value = res?.rows || []
    check.value = res?.balanceCheck || null
    unmapped.value = res?.unmapped || []
    beginCash.value = res?.beginCash ?? 0
    endCash.value = res?.endCash ?? 0
    netIncrease.value = res?.netIncrease ?? 0
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function doPrint() {
  const p = currentPeriod.value
  const head = `<h2 style="text-align:center">现金流量表</h2><p style="text-align:center">${p ? p.year + ' 年 ' + p.month + ' 月' : ''}</p>`
  const body = rows.value
    .map((r: any) => `<tr class="${r.bold ? 'b' : ''}"><td>${r.no}</td><td style="padding-left:${indentOf(r)}px">${r.name}</td><td align="right">${fmtMoney(r.periodValue)}</td><td align="right">${fmtMoney(r.ytdValue)}</td></tr>`)
    .join('')
  printHtml(`<style>table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;font-size:12px}tr.b td{font-weight:700}</style>${head}<table><tr><th>行次</th><th>项目</th><th>本期金额</th><th>本年累计</th></tr>${body}</table>`)
}

onMounted(async () => {
  await loadPeriods()
  await loadData()
})
</script>

<style scoped>
.cf-period {
  margin-left: 12px;
  font-size: 12px;
  color: var(--fm-text-3);
  font-weight: 400;
  font-family: var(--fm-font-num);
  font-variant-numeric: tabular-nums;
}
.period-select { width: 240px; }
.check-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.cf-cell { padding: 8px 0; line-height: 1.5; }
.cf-cell.is-bold { font-weight: 700; color: var(--fm-text-1); }
.cf-section {
  display: block;
  font-weight: 700;
  color: var(--fm-text-1);
  margin-bottom: 4px;
}
.cf-table :deep(tr.cf-row-net) td {
  background: var(--fm-brand-soft, #f5f7fa);
  font-weight: 700;
}
.cf-table :deep(tr.cf-row-total) td {
  background: var(--fm-brand-soft, #f5f7fa);
  font-weight: 700;
  border-top: 2px solid var(--fm-brand, #409eff);
}
.num-cell.is-neg { color: var(--fm-danger-ink, #c45656); }
.cf-alert {
  margin: 16px 24px 12px;
  border-radius: var(--fm-radius-md);
  border: none;
  font-weight: 500;
}
.cf-unmapped { margin: 0 24px 20px; }
</style>
