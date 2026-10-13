<template>
  <div class="init-page">
    <PageHeader
      :icon="DocumentChecked"
      icon-tone="brand"
      title="期初建账"
      :sub="`录入末级科目期初余额 · 试算平衡后即可启用账套 · 起始期间 ${startPeriodText}`"
    />

    <el-alert
      v-if="locked"
      class="lock-alert"
      title="账套已启用,期初余额不可修改(如需调整请录入凭证)"
      type="warning"
      show-icon
      :closable="false"
    />

    <SectionCard title="期初余额录入(仅末级科目)" class="balance-card">
      <template #actions>
        <span class="meta-pill">
          <el-icon :size="13"><InfoFilled /></el-icon>
          账套起始期间:{{ startPeriodText }}
        </span>
      </template>

      <el-table v-loading="loading" :data="rows" max-height="540" class="init-table">
        <el-table-column label="科目编码" width="140" fixed="left">
          <template #default="{ row }">
            <span class="code-cell">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="科目名称" min-width="180" fixed="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="name-cell">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类别" width="110">
          <template #default="{ row }">
            <span class="cat-pill" :class="`cat-${row.category}`">{{ CATEGORY_NAMES[row.category] || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="80">
          <template #default="{ row }">
            <span class="dir-pill" :class="`dir-${row.direction}`">{{ row.direction === 'D' ? '借' : '贷' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="借方金额" width="200">
          <template #default="{ row }">
            <el-input-number
              v-model="row._debit"
              :precision="2"
              :step="100"
              :min="0"
              :controls="false"
              :disabled="locked"
              placeholder="0.00"
              class="amount-input"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="贷方金额" width="200">
          <template #default="{ row }">
            <el-input-number
              v-model="row._credit"
              :precision="2"
              :step="100"
              :min="0"
              :controls="false"
              :disabled="locked"
              placeholder="0.00"
              class="amount-input"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="往来单位" min-width="220">
          <template #header>
            <span>往来单位 <span class="muted small">(仅辅助核算科目)</span></span>
          </template>
          <template #default="{ row }">
            <el-select
              v-if="assistFlags(row.assist).partner"
              v-model="row._partnerId"
              filterable
              clearable
              :disabled="locked"
              placeholder="选择往来单位"
              style="width: 100%"
            >
              <el-option v-for="p in partners" :key="p.id" :label="p.code + ' ' + p.name" :value="p.id" />
            </el-select>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无科目" description="请先在『科目管理』中完成科目初始化" />
        </template>
      </el-table>

      <!-- 底部统计条 -->
      <div class="stat-bar" :class="{ 'is-ok': balanced, 'is-bad': !balanced }">
        <div class="stat-bar-bg" />
        <div class="stat-bar-inner">
          <div class="stat">
            <span class="label">借方合计</span>
            <b class="value num-cell">¥ {{ fmtMoney(totalDebitCalc) }}</b>
          </div>
          <div class="stat">
            <span class="label">贷方合计</span>
            <b class="value num-cell">¥ {{ fmtMoney(totalCreditCalc) }}</b>
          </div>
          <div class="stat">
            <span class="label">借贷差额</span>
            <b class="value num-cell">¥ {{ fmtMoney(diffAbs) }}</b>
          </div>
          <span class="state-pill" :class="balanced ? 'is-ok' : 'is-bad'">
            <el-icon :size="14"><CircleCheckFilled v-if="balanced" /><WarningFilled v-else /></el-icon>
            {{ balanced ? '试算平衡' : '借贷不平衡' }}
          </span>
          <div class="actions">
            <el-button type="primary" :loading="saving" :disabled="locked" @click="save">保存期初余额</el-button>
            <el-button type="danger" plain :loading="activating" :disabled="locked || !balanced" @click="activate">启用账套</el-button>
          </div>
        </div>
      </div>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { activateTenant, initialBalances, partnerList, periodList, saveInitialBalances } from '@/api/modules'
import { CATEGORY_NAMES, assistFlags, fmtMoney, toNum } from '@/utils/format'
import {
  DocumentChecked, InfoFilled, CircleCheckFilled, WarningFilled,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const loading = ref(false)
const saving = ref(false)
const activating = ref(false)

const tenantStatus = ref(0)
const startYear = ref<number | null>(null)
const startMonth = ref<number | null>(null)
const locked = computed(() => tenantStatus.value !== 0)

const startPeriodText = computed(() => {
  if (!startYear.value) return '-'
  return `${startYear.value}-${String(startMonth.value ?? 1).padStart(2, '0')}`
})

interface BalanceRow {
  subjectId: number
  code: string
  name: string
  category: number
  direction: 'D' | 'C'
  assist?: Record<string, boolean> | null
  _debit: number
  _credit: number
  _partnerId?: number
}

const rows = ref<BalanceRow[]>([])
const partners = ref<any[]>([])
/** 服务端返回的合计(初始展示基准,编辑后以实时计算为准) */
const serverTotalDebit = ref(0)
const serverTotalCredit = ref(0)

async function loadBalances() {
  loading.value = true
  try {
    const [balRes, periodRes] = await Promise.all([initialBalances(), periodList()] as const)
    const bal: any = balRes
    const period: any = periodRes

    tenantStatus.value = Number(period?.tenantStatus ?? 0)
    startYear.value = period?.startYear ?? null
    startMonth.value = period?.startMonth ?? null
    serverTotalDebit.value = toNum(bal?.totalDebit)
    serverTotalCredit.value = toNum(bal?.totalCredit)

    rows.value = ((bal?.list ?? []) as any[]).map((r) => {
      const row: BalanceRow = {
        subjectId: r.subjectId,
        code: r.code,
        name: r.name,
        category: r.category,
        direction: r.direction,
        assist: r.assist ?? null,
        _debit: 0,
        _credit: 0,
        _partnerId: undefined,
      }
      // 预填已有期初值:'D' 填借方,'C' 填贷方;往来单位映射到选择框
      ;(r.balances || []).forEach((b: any) => {
        if (b.direction === 'D') row._debit = toNum(b.amount)
        else row._credit = toNum(b.amount)
        if (b.partnerId) row._partnerId = Number(b.partnerId)
      })
      return row
    })
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

async function loadPartners() {
  try {
    const res: any = await partnerList({ page: 1, pageSize: 500 })
    partners.value = res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  }
}

onMounted(() => {
  loadBalances()
  loadPartners()
})

// ---------- 实时试算 ----------
const totalDebitCalc = computed(() => rows.value.reduce((s, r) => s + toNum(r._debit), 0))
const totalCreditCalc = computed(() => rows.value.reduce((s, r) => s + toNum(r._credit), 0))
const diffAbs = computed(() => Math.abs(totalDebitCalc.value - totalCreditCalc.value))
const hasData = computed(
  () => totalDebitCalc.value > 0 || totalCreditCalc.value > 0 || serverTotalDebit.value > 0 || serverTotalCredit.value > 0,
)
const balanced = computed(() => diffAbs.value < 0.01 && hasData.value)

// ---------- 保存 ----------
async function save() {
  if (locked.value) return
  if (!balanced.value) {
    ElMessage.warning('借贷不平衡,请调整后再保存')
    return
  }
  const items: { subjectCode: string; direction: 'D' | 'C'; amount: number; partnerCode?: string }[] = []
  rows.value.forEach((r) => {
    const d = toNum(r._debit)
    const c = toNum(r._credit)
    if (d <= 0 && c <= 0) return
    const item: { subjectCode: string; direction: 'D' | 'C'; amount: number; partnerCode?: string } = {
      subjectCode: r.code,
      direction: d > 0 ? 'D' : 'C',
      amount: d > 0 ? d : c,
    }
    if (r._partnerId) {
      const p = partners.value.find((x) => x.id === r._partnerId)
      if (p) item.partnerCode = p.code
    }
    items.push(item)
  })

  saving.value = true
  try {
    await saveInitialBalances(items)
    ElMessage.success(`保存成功,共 ${items.length} 条期初余额`)
    await Promise.all([loadBalances(), loadPartners()])
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

// ---------- 启用账套 ----------
async function activate() {
  try {
    await ElMessageBox.confirm('启用后期初余额将锁定且开始记账,是否确认?', '提示', { type: 'warning' })
  } catch {
    return
  }
  activating.value = true
  try {
    await activateTenant()
    ElMessage.success('账套已启用')
    await Promise.all([loadBalances(), loadPartners()])
  } catch {
    /* 拦截器已提示 */
  } finally {
    activating.value = false
  }
}
</script>

<style scoped>
.init-page { display: flex; flex-direction: column; gap: 18px; }
.lock-alert { margin-bottom: 0; }
.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--fm-text-3);
  padding: 4px 10px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-pill);
}

.code-cell {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  display: inline-block;
}
.name-cell { font-weight: 500; }
.muted { color: var(--fm-text-3); }
.small { font-size: 11px; }

.cat-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
}
.cat-1 { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.cat-2 { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
.cat-3 { background: rgba(99,102,241,0.10); color: var(--fm-brand-600); }
.cat-4 { background: var(--fm-info-soft); color: var(--fm-info); }
.cat-5 { background: rgba(139,92,246,0.10); color: var(--fm-violet-600); }
.cat-6 { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }
html.dark .cat-3 { color: var(--fm-brand-300); }
html.dark .cat-5 { color: var(--fm-violet-300); }
html.dark .cat-4 { color: #38bdf8; }

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

.amount-input { text-align: left; }

/* 底部统计条 */
.stat-bar {
  position: sticky;
  bottom: 16px;
  z-index: 10;
  margin: 20px -24px -24px;
  border-radius: 0 0 var(--fm-radius-md) var(--fm-radius-md);
  background: var(--fm-bg-elevated);
  border-top: 1px solid var(--fm-border-soft);
  box-shadow: 0 -8px 24px -12px rgba(15,23,42,0.12);
  overflow: hidden;
  isolation: isolate;
}
.stat-bar-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(139,92,246,0.04) 100%);
}
.stat-bar.is-ok .stat-bar-bg { background: linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(99,102,241,0.04) 100%); }
.stat-bar.is-bad .stat-bar-bg { background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(245,158,11,0.04) 100%); }
.stat-bar-inner {
  display: flex;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
  padding: 18px 24px;
}
.stat { display: flex; align-items: baseline; gap: 8px; }
.stat .label { font-size: 12px; color: var(--fm-text-3); font-weight: 500; }
.stat .value { font-size: 18px; font-weight: 700; color: var(--fm-text-1); font-family: var(--fm-font-num); letter-spacing: -0.01em; }

.state-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: var(--fm-radius-pill);
}
.state-pill.is-ok  { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.state-pill.is-bad { background: var(--fm-danger-soft);  color: var(--fm-danger-ink); }

.actions { margin-left: auto; display: flex; align-items: center; gap: 10px; }
</style>
