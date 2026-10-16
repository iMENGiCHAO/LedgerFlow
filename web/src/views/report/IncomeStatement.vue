<template>
  <div class="is-page">
    <PageHeader
      :icon="DataLine"
      icon-tone="violet"
      title="利润表"
      sub="收入、成本费用与利润的本期及年累计经营成果"
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

    <SectionCard padless>
      <template #title>
        <span>利润表</span>
        <span v-if="currentPeriod" class="is-period">{{ currentPeriod.year }} 年 {{ currentPeriod.month }} 月</span>
      </template>

      <el-table v-loading="loading" :data="rows" class="is-table">
        <el-table-column label="项目" min-width="260">
          <template #default="{ row }">
            <div
              :class="['is-cell', { 'is-bold': row.bold }]"
              :style="{ paddingLeft: toNum(row.indent) * 20 + 'px' }"
            >
              {{ row.rowName }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="本期金额" align="right" min-width="150">
          <template #default="{ row }"><span class="num-cell">{{ fmtMoney(row.periodValue) }}</span></template>
        </el-table-column>
        <el-table-column label="年累计金额" align="right" min-width="150">
          <template #default="{ row }"><span class="num-cell">{{ fmtMoney(row.ytdValue) }}</span></template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无数据" description="请选择会计期间后查询" />
        </template>
      </el-table>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Printer, DataLine, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { periodList, reportIncome } from '@/api/modules'
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
      url: '/reports/income',
      filename: '利润表',
      params: { periodId: periodId.value },
      loadingText: '利润表 Excel',
    })
  } finally {
    exporting.value = false
  }
}

const loading = ref(false)
const rows = ref<any[]>([])

const currentPeriod = computed(() => periods.value.find((p: any) => p.id === periodId.value) || null)
const hasData = computed(() => rows.value.length > 0)

function periodLabel(p: any): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}(${PERIOD_STATUS[p.status] ?? '未知状态'})`
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
  if (!periodId.value) return
  loading.value = true
  try {
    const res: any = await reportIncome(periodId.value as number)
    rows.value = res?.rows || []
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
}

function doPrint() {
  const sub = `${auth.currentTenantName || '未指定账套'}　会计期间:${currentPeriod.value ? `${currentPeriod.value.year} 年 ${currentPeriod.value.month} 月` : '-'}`
  const trs = rows.value
    .map((r: any) => {
      const pad = toNum(r.indent) * 20 + 8
      const nm = esc(r.rowName)
      const name = r.bold
        ? `<b style="padding-left:${pad}px;display:inline-block">${nm}</b>`
        : `<span style="padding-left:${pad}px;display:inline-block">${nm}</span>`
      return `<tr><td>${name}</td><td class="r">${esc(fmtMoney(r.periodValue))}</td><td class="r">${esc(fmtMoney(r.ytdValue))}</td></tr>`
    })
    .join('')
  const html = `
<h1>利润表</h1>
<p class="sub">${esc(sub)}</p>
<table>
  <thead><tr><th style="width:52%">项目</th><th style="width:24%" class="r">本期金额</th><th style="width:24%" class="r">年累计金额</th></tr></thead>
  <tbody>${trs}</tbody>
</table>`
  printHtml('利润表', html)
}

onMounted(async () => {
  await loadPeriods()
  await loadData()
})
</script>

<style scoped>
.is-page { display: flex; flex-direction: column; gap: 18px; }
.period-select { width: 240px; }
.is-period {
  margin-left: 12px;
  font-size: 12px;
  color: var(--fm-text-3);
  font-weight: 400;
  font-family: var(--fm-font-num);
  font-variant-numeric: tabular-nums;
}
.is-cell { padding: 8px 0; line-height: 1.5; }
.is-cell.is-bold { font-weight: 700; color: var(--fm-text-1); }
</style>
