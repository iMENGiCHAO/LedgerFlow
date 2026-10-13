<template>
  <div class="bs-page">
    <PageHeader
      :icon="DataAnalysis"
      icon-tone="brand"
      title="科目余额表"
      :sub="`${year} 年 ${month} 月 · 各科目期初、本期发生、年累计与期末余额`"
    >
      <template #actions>
        <el-select v-model="year" style="width: 130px" @change="loadData">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
        <el-select v-model="month" style="width: 110px" @change="loadData">
          <el-option v-for="m in 12" :key="m" :label="`${m} 月`" :value="m" />
        </el-select>
        <el-button type="primary" :icon="Search" :loading="loading" @click="loadData">查询</el-button>
        <el-button :icon="Download" @click="doExport">导出 CSV</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <template #actions>
        <el-tag v-if="totals" :type="balanced ? 'success' : 'danger'" effect="plain" class="check-pill">
          <el-icon :size="12"><CircleCheckFilled v-if="balanced" /><WarningFilled v-else /></el-icon>
          {{ balanced ? '试算平衡' : '借贷不平衡' }}
        </el-tag>
      </template>

      <el-table
        v-loading="loading"
        :data="list"
        show-summary
        :summary-method="summaryMethod"
        class="bs-table"
      >
        <el-table-column label="科目编码" width="120">
          <template #default="{ row }">
            <span class="code-cell">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="科目名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="openDebit" label="期初借方" align="right" :formatter="moneyFmt" min-width="110" />
        <el-table-column prop="openCredit" label="期初贷方" align="right" :formatter="moneyFmt" min-width="110" />
        <el-table-column prop="debit" label="本期借方" align="right" :formatter="moneyFmt" min-width="110" />
        <el-table-column prop="credit" label="本期贷方" align="right" :formatter="moneyFmt" min-width="110" />
        <el-table-column prop="ytdDebit" label="年累计借方" align="right" :formatter="moneyFmt" min-width="115" />
        <el-table-column prop="ytdCredit" label="年累计贷方" align="right" :formatter="moneyFmt" min-width="115" />
        <el-table-column prop="closeDebit" label="期末借方" align="right" :formatter="moneyFmt" min-width="115" />
        <el-table-column prop="closeCredit" label="期末贷方" align="right" :formatter="moneyFmt" min-width="115" />
        <template #empty>
          <EmptyState title="暂无数据" description="该期间暂无科目余额数据,请调整年月后重新查询" />
        </template>
      </el-table>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Download, DataAnalysis, CircleCheckFilled, WarningFilled } from '@element-plus/icons-vue'
import { reportBalanceSummary } from '@/api/modules'
import { downloadCsv, fmtMoney, toNum } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const now = new Date()
const yearOptions: number[] = []
for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) yearOptions.push(y)

const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const loading = ref(false)
const list = ref<any[]>([])
const totals = ref<any>(null)

const balanced = computed(() => {
  const t = totals.value || {}
  return (
    Math.abs(toNum(t.openDebit) - toNum(t.openCredit)) < 0.01 &&
    Math.abs(toNum(t.closeDebit) - toNum(t.closeCredit)) < 0.01
  )
})

const ytdSum = computed(() => ({
  debit: list.value.reduce((s: number, r: any) => s + toNum(r.ytdDebit), 0),
  credit: list.value.reduce((s: number, r: any) => s + toNum(r.ytdCredit), 0),
}))

async function loadData() {
  loading.value = true
  try {
    const res: any = await reportBalanceSummary(year.value, month.value)
    list.value = res?.list || []
    totals.value = res?.totals || null
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function moneyFmt(_row: any, _col: any, val: any): string {
  return fmtMoney(val)
}

const SUM_KEYS = ['openDebit', 'openCredit', 'debit', 'credit', 'ytdDebit', 'ytdCredit', 'closeDebit', 'closeCredit']
function summaryMethod({ columns }: any): (string | number)[] {
  const out: (string | number)[] = []
  columns.forEach((_c: any, i: number) => {
    if (i === 0) { out.push('合计'); return }
    if (i === 1) { out.push(''); return }
    const key = SUM_KEYS[i - 2]
    if (!key) { out.push(''); return }
    if (key === 'ytdDebit') out.push(fmtMoney(ytdSum.value.debit))
    else if (key === 'ytdCredit') out.push(fmtMoney(ytdSum.value.credit))
    else out.push(totals.value ? fmtMoney((totals.value as any)[key]) : '-')
  })
  return out
}

function doExport() {
  if (!list.value.length) {
    ElMessage.warning('当前期间无数据可导出')
    return
  }
  const rows: (string | number | null)[][] = [
    ['科目余额表', `${year.value}`, `${month.value}`],
    ['科目编码', '科目名称', '期初借方', '期初贷方', '本期借方', '本期贷方', '年累计借方', '年累计贷方', '期末借方', '期末贷方'],
    ...list.value.map((r: any) => [
      r.code, r.name,
      toNum(r.openDebit), toNum(r.openCredit),
      toNum(r.debit), toNum(r.credit),
      toNum(r.ytdDebit), toNum(r.ytdCredit),
      toNum(r.closeDebit), toNum(r.closeCredit),
    ]),
    [
      '合计', '',
      toNum(totals.value?.openDebit), toNum(totals.value?.openCredit),
      toNum(totals.value?.debit), toNum(totals.value?.credit),
      ytdSum.value.debit, ytdSum.value.credit,
      toNum(totals.value?.closeDebit), toNum(totals.value?.closeCredit),
    ],
  ]
  downloadCsv(`科目余额表_${year.value}-${month.value}.csv`, rows)
  ElMessage.success('导出成功')
}

onMounted(loadData)
</script>

<style scoped>
.bs-page { display: flex; flex-direction: column; gap: 18px; }
.code-cell {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  display: inline-block;
}
.check-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
:deep(.el-table__footer .cell) { font-weight: 700; }
</style>
