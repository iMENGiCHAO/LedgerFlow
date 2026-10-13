<template>
  <div class="closing-page">
    <PageHeader
      :icon="Calendar"
      icon-tone="warning"
      title="期末处理"
      sub="结账检查 · 损益结转 · 折旧计提 · 期间关闭"
    >
      <template #actions>
        <el-button type="primary" plain :disabled="!periodId" :loading="cfwLoading" @click="doCarryforward">结转损益</el-button>
        <el-button type="primary" plain :disabled="!periodId" :loading="depLoading" @click="doDepreciation">计提折旧</el-button>
        <el-button type="danger" :disabled="!periodId" :loading="closeLoading" @click="doCloseBook">执行结账</el-button>
        <el-button type="warning" plain :disabled="!periodId" :loading="unCloseLoading" @click="doUnClose">反结账</el-button>
      </template>
    </PageHeader>

    <SectionCard padless class="period-card">
      <FilterBar>
        <span class="filter-label">会计期间</span>
        <el-select
          v-model="periodId"
          placeholder="请选择会计期间"
          :loading="periodLoading"
          style="width: 240px"
          @change="loadChecklist"
        >
          <el-option v-for="p in periods" :key="p.id" :value="p.id" :label="periodLabel(p)" />
        </el-select>
        <span v-if="currentPeriod" class="status-pill" :class="`pill-${statusTagType(currentPeriod.status)}`">
          <span class="pill-dot" />
          {{ PERIOD_STATUS[currentPeriod.status] || '未知状态' }}
        </span>
        <template #extra>
          <span class="filter-tip">
            <el-icon :size="14"><InfoFilled /></el-icon>
            结账前请先完成结转损益与计提折旧,并确认全部检查项通过
          </span>
        </template>
      </FilterBar>
    </SectionCard>

    <SectionCard class="check-card">
      <template #title>
        <span class="check-title">
          <el-icon :size="16"><Operation /></el-icon>
          结账检查
        </span>
      </template>
      <template #actions>
        <span v-if="blockingFailCount > 0" class="check-meta fail">
          <el-icon :size="13"><WarningFilled /></el-icon>
          {{ blockingFailCount }} 项阻断未通过
        </span>
        <span v-else-if="items.length && failCount === 0" class="check-meta ok">
          <el-icon :size="13"><CircleCheckFilled /></el-icon>
          全部检查项已通过
        </span>
      </template>

      <div v-loading="checkLoading" class="check-wrap">
        <EmptyState
          v-if="!checkLoading && !items.length"
          title="暂无检查项"
          description="选择会计期间后自动加载结账检查清单"
        />
        <div v-for="it in items" :key="it.key" class="check-item" :class="{ 'is-fail': !it.pass, 'is-pass': it.pass }">
          <div class="check-icon" :class="it.pass ? 'is-pass' : 'is-fail'">
            <el-icon :size="18">
              <CircleCheckFilled v-if="it.pass" />
              <CircleCloseFilled v-else />
            </el-icon>
          </div>
          <div class="check-body">
            <div class="check-name">
              <span class="check-name-text">{{ it.name }}</span>
              <span v-if="it.blocking" class="blocking-pill" :class="it.pass ? 'is-ok' : 'is-bad'">阻断项</span>
            </div>
            <div v-if="it.detail" class="check-detail">{{ it.detail }}</div>
          </div>
        </div>
        <div v-if="items.length" class="hint">
          <el-icon :size="14"><InfoFilled /></el-icon>
          执行结账后本期间将锁定,如需调整凭证请先反结账;所有操作结果会自动刷新检查项与期间状态。
        </div>
      </div>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  closingChecklist,
  closingProfitCarryforward,
  closingDepreciation,
  closingClose,
  closingUnClose,
} from '@/api/modules'
import { fmtMoney, PERIOD_STATUS } from '@/utils/format'
import { Calendar, InfoFilled, Operation, CircleCheckFilled, CircleCloseFilled, WarningFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const periods = ref<any[]>([])
const periodId = ref<number | null>(null)
const periodLoading = ref(false)

const items = ref<any[]>([])
const checkLoading = ref(false)

const cfwLoading = ref(false)
const depLoading = ref(false)
const closeLoading = ref(false)
const unCloseLoading = ref(false)

const currentPeriod = computed(() => periods.value.find((p: any) => p.id === periodId.value) || null)
const failCount = computed(() => items.value.filter((i: any) => !i.pass).length)
const blockingFailCount = computed(() => items.value.filter((i: any) => i.blocking && !i.pass).length)

function periodLabel(p: any): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}(${PERIOD_STATUS[p.status] ?? '未知状态'})`
}

function statusTagType(status: number): 'success' | 'warning' | 'info' {
  if (status === 2) return 'success'
  if (status === 1) return 'warning'
  return 'info'
}

async function loadPeriods(pickDefault = false) {
  periodLoading.value = true
  try {
    const res: any = await periodList()
    periods.value = res?.list || []
    if (pickDefault) {
      const list = periods.value
      let def: any = null
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].status !== 2) { def = list[i]; break }
      }
      if (!def && list.length) def = list[list.length - 1]
      periodId.value = def ? def.id : null
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    periodLoading.value = false
  }
}

async function loadChecklist() {
  if (!periodId.value) {
    items.value = []
    return
  }
  checkLoading.value = true
  try {
    const res: any = await closingChecklist(periodId.value as number)
    items.value = res?.items || []
  } catch {
    /* 拦截器已提示 */
  } finally {
    checkLoading.value = false
  }
}

/** 每次操作成功后刷新检查项与期间列表(期间状态可能变化),保持当前选中期间 */
async function refreshAfterAction() {
  await Promise.all([loadChecklist(), loadPeriods(false)])
}

// ---------- 结转损益 ----------
async function doCarryforward() {
  if (!periodId.value) return
  cfwLoading.value = true
  try {
    const res: any = await closingProfitCarryforward(Number(periodId.value))
    const np = res?.netProfit
    if (np !== undefined && np !== null) {
      ElMessage.success(`结转完成,本期净利润 ${fmtMoney(np)}`)
    } else {
      ElMessage.success('结转完成')
    }
    await refreshAfterAction()
  } catch {
    /* 拦截器已提示 */
  } finally {
    cfwLoading.value = false
  }
}

// ---------- 计提折旧 ----------
async function doDepreciation() {
  if (!periodId.value) return
  depLoading.value = true
  try {
    const res: any = await closingDepreciation(Number(periodId.value))
    if (res && (res.assetCount !== undefined || res.totalDepreciation !== undefined)) {
      ElMessage.success(`计提完成:${res.assetCount ?? 0} 项资产,折旧合计 ${fmtMoney(res.totalDepreciation)}`)
    } else {
      ElMessage.success('计提完成')
    }
    await refreshAfterAction()
  } catch {
    /* 拦截器已提示 */
  } finally {
    depLoading.value = false
  }
}

// ---------- 执行结账(危险操作) ----------
async function doCloseBook() {
  if (!periodId.value) return
  try {
    await ElMessageBox.confirm('结账后本期间将禁止记账,是否继续?', '执行结账', { type: 'warning' })
  } catch {
    return
  }
  closeLoading.value = true
  try {
    await closingClose(Number(periodId.value))
    ElMessage.success('结账完成')
    await refreshAfterAction()
  } catch {
    /* 拦截器已提示(含未通过项明细) */
  } finally {
    closeLoading.value = false
  }
}

// ---------- 反结账(危险操作) ----------
async function doUnClose() {
  if (!periodId.value) return
  try {
    await ElMessageBox.confirm('反结账将解锁本期间并允许修改凭证,可能影响已出报表,是否继续?', '反结账', { type: 'warning' })
  } catch {
    return
  }
  unCloseLoading.value = true
  try {
    await closingUnClose(Number(periodId.value))
    ElMessage.success('已反结账')
    await refreshAfterAction()
  } catch {
    /* 拦截器已提示 */
  } finally {
    unCloseLoading.value = false
  }
}

onMounted(async () => {
  await loadPeriods(true)
  await loadChecklist()
})
</script>

<style scoped>
.closing-page { display: flex; flex-direction: column; gap: 18px; }
.filter-label { font-size: 12px; color: var(--fm-text-2); font-weight: 500; }
.filter-tip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--fm-text-3);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  white-space: nowrap;
}
.pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-pill.pill-success { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.status-pill.pill-warning { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
.status-pill.pill-info    { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }
.status-pill.pill-danger  { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }

.check-title { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.check-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: var(--fm-radius-pill);
}
.check-meta.ok  { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.check-meta.fail { background: var(--fm-danger-soft);  color: var(--fm-danger-ink); }

.check-wrap { min-height: 120px; }
.check-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 12px;
  border-radius: var(--fm-radius-md);
  border: 1px solid var(--fm-border-soft);
  margin-bottom: 8px;
  transition: all var(--fm-dur-base) var(--fm-ease);
  background: var(--fm-bg-elevated);
}
.check-item:hover { box-shadow: var(--fm-shadow-sm); }
.check-item.is-fail { background: var(--fm-danger-soft); border-color: rgba(239,68,68,0.25); }
.check-item.is-pass { background: var(--fm-bg-elevated); }

.check-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.check-icon.is-pass { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.check-icon.is-fail { background: rgba(239,68,68,0.12); color: var(--fm-danger-ink); }

.check-body { min-width: 0; flex: 1; }
.check-name { display: flex; align-items: center; gap: 8px; }
.check-name-text { font-size: 14px; font-weight: 600; color: var(--fm-text-1); }
.blocking-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--fm-radius-pill);
}
.blocking-pill.is-ok  { background: var(--fm-bg-muted); color: var(--fm-text-3); }
.blocking-pill.is-bad { background: var(--fm-danger); color: #fff; }

.check-detail {
  margin-top: 4px;
  font-size: 12px;
  color: var(--fm-text-2);
  word-break: break-all;
  line-height: 1.5;
}

.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 12px 16px;
  border-top: 1px solid var(--fm-border-soft);
  font-size: 12px;
  color: var(--fm-text-3);
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-sm);
  line-height: 1.6;
}
</style>
