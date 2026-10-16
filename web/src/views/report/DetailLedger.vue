<template>
  <div class="dl-page">
    <PageHeader
      :icon="Document"
      icon-tone="blue"
      title="明细账"
      sub="单科目序时账与余额勾稽 · 支持年度内任意月份区间查询"
    />

    <SectionCard padless>
      <FilterBar>
        <span class="filter-label">科目</span>
        <el-select
          v-model="subjectId"
          filterable
          placeholder="请选择明细科目"
          style="width: 280px"
        >
          <el-option
            v-for="s in subjectOptions"
            :key="s.id"
            :label="`${s.code} ${s.name}`"
            :value="s.id"
          />
        </el-select>
        <span class="filter-label">年度</span>
        <el-select v-model="year" style="width: 120px">
          <el-option v-for="y in yearOptions" :key="y" :label="`${y} 年`" :value="y" />
        </el-select>
        <span class="filter-label">起止月份</span>
        <el-select v-model="fromMonth" style="width: 100px">
          <el-option v-for="m in 12" :key="`f${m}`" :label="`${m} 月`" :value="m" />
        </el-select>
        <span class="dash">至</span>
        <el-select v-model="toMonth" style="width: 100px">
          <el-option v-for="m in 12" :key="`t${m}`" :label="`${m} 月`" :value="m" />
        </el-select>
        <el-button type="primary" :icon="Search" :disabled="!subjectId" :loading="loading" @click="doQuery">查询</el-button>
        <el-button :icon="Download" :disabled="!ledger" :loading="exporting" @click="onExport">导出Excel</el-button>
      </FilterBar>

      <div v-if="ledger?.subject" class="dl-meta">
        <span class="meta-subject">
          <span class="code-cell">{{ ledger.subject.code }}</span>
          <span class="meta-name">{{ ledger.subject.name }}</span>
        </span>
        <span class="meta-range">{{ year }} 年 {{ fromMonth }} - {{ toMonth }} 月</span>
        <span class="meta-divider" />
        <span class="meta-pair">
          <span class="meta-key">期初</span>
          <span class="num-cell">¥ {{ fmtMoney(ledger?.opening?.amount) }} {{ ledger?.opening?.side ?? '' }}</span>
        </span>
        <span class="meta-pair">
          <span class="meta-key">期末</span>
          <span class="num-cell">¥ {{ fmtMoney(ledger?.closing?.amount) }} {{ ledger?.closing?.side ?? '' }}</span>
        </span>
      </div>

      <el-empty
        v-if="!queried && !loading"
        description="请先在上方选择明细科目与起止月份,再点击查询"
        :image-size="110"
      />

      <el-table
        v-else
        v-loading="loading"
        :data="displayRows"
        :row-class-name="rowClass"
        class="dl-table"
      >
        <el-table-column label="日期" width="120" align="center">
          <template #default="{ row }">
            <template v-if="isSpecial(row)">{{ specialName(row._kind) }}</template>
            <template v-else>{{ fmtDate(row.date) }}</template>
          </template>
        </el-table-column>
        <el-table-column label="凭证号" width="110" align="center">
          <template #default="{ row }">
            <span v-if="!isSpecial(row)" class="voucher-no-cell">{{ voucherNo(row.word, row.no) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ isSpecial(row) ? (row._kind === 'open' ? '期初余额' : '') : row.summary || '' }}
          </template>
        </el-table-column>
        <el-table-column prop="partnerName" label="对方单位" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="isSpecial(row)" class="muted">-</span>
            <span v-else>{{ row.partnerName || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="借方" align="right" min-width="120">
          <template #default="{ row }">
            <span class="num-cell" :class="{ muted: borrowText(row) === '-' }">{{ borrowText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方" align="right" min-width="120">
          <template #default="{ row }">
            <span class="num-cell" :class="{ muted: creditText(row) === '-' }">{{ creditText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="70" align="center">
          <template #default="{ row }">
            <span v-if="row._kind === 'open'" class="dir-pill dir-D">{{ dirText(row) }}</span>
            <span v-else-if="row._kind === 'close'" class="dir-pill" :class="`dir-${row._kind === 'close' ? (ledger?.closing?.side === '借' ? 'D' : 'C') : 'D'}`">{{ dirText(row) }}</span>
            <span v-else-if="isSpecial(row)" class="muted">-</span>
            <span v-else class="dir-pill" :class="`dir-${row.direction === '借' ? 'D' : 'C'}`">{{ dirText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="余额" align="right" min-width="140">
          <template #default="{ row }">
            <span class="num-cell">{{ balanceText(row) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无发生额" description="该科目在此期间无发生额,可调整月份范围后重新查询" />
        </template>
      </el-table>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Document, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { reportDetailLedger, subjectTree } from '@/api/modules'
import { fmtDate, fmtMoney, voucherNo } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const now = new Date()
const yearOptions: number[] = []
for (let y = now.getFullYear() - 3; y <= now.getFullYear(); y++) yearOptions.push(y)

const subjectOptions = ref<any[]>([])
const subjectId = ref<number | null>(null)
const year = ref(now.getFullYear())
const fromMonth = ref(1)
const toMonth = ref(now.getMonth() + 1)

const loading = ref(false)
const queried = ref(false)
const ledger = ref<any>(null)

async function loadSubjects() {
  try {
    const res: any = await subjectTree()
    subjectOptions.value = (res?.list || []).filter((s: any) => s.isLeaf && s.status === 1)
  } catch {
    /* 拦截器已提示 */
  }
}

const displayRows = computed<any[]>(() => {
  const lines = ledger.value?.lines || []
  return [
    { _kind: 'open' },
    ...lines.map((l: any) => ({ ...l, _kind: 'line' })),
    { _kind: 'total' },
    { _kind: 'close' },
  ]
})

function isSpecial(row: any): boolean {
  return !!row?._kind && row._kind !== 'line'
}

function specialName(kind?: string): string {
  if (kind === 'open') return '期初余额'
  if (kind === 'total') return '本期合计'
  if (kind === 'close') return '期末余额'
  return ''
}

function dirText(row: any): string {
  if (row._kind === 'open') return ledger.value?.opening?.side || '-'
  if (row._kind === 'close') return ledger.value?.closing?.side || '-'
  return row.direction || '-'
}

function borrowText(row: any): string {
  if (row._kind === 'total') return fmtMoney(ledger.value?.totals?.debit)
  if (isSpecial(row)) return '-'
  return fmtMoney(row.debit)
}

function creditText(row: any): string {
  if (row._kind === 'total') return fmtMoney(ledger.value?.totals?.credit)
  if (isSpecial(row)) return '-'
  return fmtMoney(row.credit)
}

function balanceText(row: any): string {
  if (row._kind === 'open') return `${fmtMoney(ledger.value?.opening?.amount)} ${ledger.value?.opening?.side ?? ''}`.trim()
  if (row._kind === 'close') return `${fmtMoney(ledger.value?.closing?.amount)} ${ledger.value?.closing?.side ?? ''}`.trim()
  if (row._kind === 'total') return '-'
  return `${fmtMoney(row.balance)} ${row.balanceSide ?? ''}`.trim()
}

function rowClass({ row }: any): string {
  if (isSpecial(row)) return 'is-special'
  return ''
}

const exporting = ref(false)

async function onExport() {
  if (!subjectId.value || !ledger.value) return
  exporting.value = true
  try {
    await exportExcel({
      url: `/reports/detail-ledger/${subjectId.value}`,
      filename: `明细账-${ledger.value.subject?.code || ''}`,
      params: { year: year.value, fromMonth: fromMonth.value, toMonth: toMonth.value },
      loadingText: '明细账 Excel',
    })
  } finally {
    exporting.value = false
  }
}

async function doQuery() {
  if (!subjectId.value) return
  if (fromMonth.value > toMonth.value) {
    ElMessage.warning('起始月份不能晚于截止月份')
    return
  }
  loading.value = true
  try {
    const res: any = await reportDetailLedger(subjectId.value, year.value, fromMonth.value, toMonth.value)
    ledger.value = res || null
    queried.value = true
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

onMounted(loadSubjects)
</script>

<style scoped>
.dl-page { display: flex; flex-direction: column; gap: 18px; }
.filter-label {
  font-size: 12px;
  color: var(--fm-text-2);
  font-weight: 500;
  letter-spacing: 0.02em;
}
.dash { color: var(--fm-text-3); }

.dl-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  background: var(--fm-bg-muted);
  border-bottom: 1px solid var(--fm-border-soft);
  flex-wrap: wrap;
}
.meta-subject { display: inline-flex; align-items: center; gap: 8px; }
.code-cell {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  color: var(--fm-text-1);
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-elevated);
  border-radius: var(--fm-radius-xs);
  border: 1px solid var(--fm-border-soft);
}
.meta-name { font-size: 15px; font-weight: 600; color: var(--fm-text-1); }
.meta-range { font-size: 12px; color: var(--fm-text-3); font-family: var(--fm-font-num); }
.meta-divider { width: 1px; height: 16px; background: var(--fm-border); }
.meta-pair { display: inline-flex; align-items: baseline; gap: 6px; font-size: 13px; }
.meta-key { color: var(--fm-text-3); font-size: 12px; }

.voucher-no-cell {
  font-family: var(--fm-font-num);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
}

.dir-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--fm-radius-xs);
  min-width: 30px;
  text-align: center;
}
.dir-D { background: var(--fm-brand-50); color: var(--fm-brand-600); }
.dir-C { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
html.dark .dir-D { background: rgba(99,102,241,0.15); color: var(--fm-brand-300); }

.dl-table :deep(tr.is-special td) {
  font-weight: 600;
  background: rgba(99,102,241,0.05) !important;
  color: var(--fm-text-1);
}
.dl-table :deep(tr.is-special:hover td) {
  background: rgba(99,102,241,0.08) !important;
}
</style>
