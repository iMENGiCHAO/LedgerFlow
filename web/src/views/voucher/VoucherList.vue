<template>
  <div class="voucher-list">
    <PageHeader
      :icon="Notebook"
      icon-tone="brand"
      title="凭证列表"
      sub="全部记账凭证的查询、审核与打印"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button v-if="auth.hasPerm('voucher:create')" type="primary" :icon="Plus" @click="$router.push('/vouchers/new')">
          录入凭证
        </el-button>
      </template>
    </PageHeader>

    <!-- 统计概览条 -->
    <div class="overview-strip">
      <div class="ov-item">
        <span class="ov-label">本期凭证</span>
        <span class="ov-num num-cell">{{ total }}</span>
        <span class="ov-suffix">张</span>
      </div>
      <div class="ov-item">
        <span class="ov-label">借方合计</span>
        <span class="ov-num num-cell">¥ {{ totalDebitFmt }}</span>
      </div>
      <div class="ov-item">
        <span class="ov-label">贷方合计</span>
        <span class="ov-num num-cell">¥ {{ totalCreditFmt }}</span>
      </div>
      <div class="ov-item">
        <span class="ov-label">状态分布</span>
        <div class="ov-tags">
          <span v-for="(v, k) in statusSummary" :key="k" class="ov-tag" :class="`tag-${VOUCHER_STATUS[Number(k)]?.tag || 'info'}`">
            {{ VOUCHER_STATUS[Number(k)]?.label || k }} · {{ v }}
          </span>
        </div>
      </div>
    </div>

    <SectionCard padless>
      <template #actions>
        <el-button :icon="Refresh" size="small" @click="loadList">刷新</el-button>
      </template>
      <FilterBar class="voucher-filter">
        <el-select v-model="query.periodId" placeholder="会计期间" clearable style="width: 150px">
          <el-option v-for="p in periods" :key="p.id" :label="periodLabel(p)" :value="p.id" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
          <el-option v-for="(v, k) in VOUCHER_STATUS" :key="k" :label="v.label" :value="Number(k)" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 260px"
        />
        <el-input v-model="query.keyword" placeholder="摘要 / 备注" clearable style="width: 200px" :prefix-icon="Search" @keyup.enter="search" />
        <el-input-number v-model="query.minAmount" :min="0" :controls="false" placeholder="金额≥" style="width: 120px" />
        <el-input-number v-model="query.maxAmount" :min="0" :controls="false" placeholder="金额≤" style="width: 120px" />
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
      </FilterBar>

      <el-table :data="list" v-loading="loading" class="voucher-table" row-key="id" @expand-change="onExpand">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="entries-wrap" v-loading="row.__loadingEntries">
              <div class="entries-head">
                <el-icon :size="14"><Document /></el-icon>
                <span>分录明细 · {{ (row.entries || []).length }} 行</span>
                <span v-if="row.totalDebit != null" class="entries-total">
                  借 ¥{{ fmtMoney(Number(row.totalDebit)) }} · 贷 ¥{{ fmtMoney(Number(row.totalCredit)) }}
                </span>
              </div>
              <el-table v-if="(row.entries || []).length" :data="row.entries" size="small" class="entry-mini">
                <el-table-column prop="lineNo" label="#" width="52" align="center" />
                <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip />
                <el-table-column label="会计科目" min-width="200">
                  <template #default="{ row: e }">{{ e.subject ? `${e.subject.code} ${e.subject.name}` : '-' }}</template>
                </el-table-column>
                <el-table-column label="借方金额" width="130" align="right">
                  <template #default="{ row: e }">
                    <span :class="['num-cell', { muted: !Number(e.debit) }]">{{ fmtMoney(e.debit, '') }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="贷方金额" width="130" align="right">
                  <template #default="{ row: e }">
                    <span :class="['num-cell', { muted: !Number(e.credit) }]">{{ fmtMoney(e.credit, '') }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="凭证号" width="120">
          <template #default="{ row }">
            <span class="voucher-no">{{ voucherNo(row.word, row.no) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="日期" width="110">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-pill" :class="`pill-${VOUCHER_STATUS[row.status]?.tag || 'info'}`">
              <span class="pill-dot" />
              {{ VOUCHER_STATUS[row.status]?.label || row.status }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="借方合计" width="140" align="right">
          <template #default="{ row }">
            <span class="num-cell text-brand">¥ {{ fmtMoney(row.totalDebit) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="memo" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="来源" width="100">
          <template #default="{ row }">
            <span v-if="SOURCE_TYPES[row.sourceType]" class="source-tag">{{ SOURCE_TYPES[row.sourceType] }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="制单人" width="90" align="center">
          <template #default="{ row }">{{ row.creator?.realName || '-' }}</template>
        </el-table-column>
        <el-table-column label="审核人" width="90" align="center">
          <template #default="{ row }">{{ row.auditor?.realName || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <template v-if="row.status === 0">
                <button v-if="canCreate" class="action-btn" @click="submitRow(row)">提交</button>
                <button v-if="canCreate" class="action-btn" @click="$router.push(`/vouchers/${row.id}/edit`)">编辑</button>
                <button v-if="canCreate" class="action-btn danger" @click="removeRow(row)">删除</button>
                <button v-if="canCreate" class="action-btn warn" @click="voidRow(row)">作废</button>
              </template>
              <template v-else-if="row.status === 1">
                <el-tooltip v-if="!canAuditSame(row)" content="制单人与审核人不能相同" placement="top">
                  <button class="action-btn" disabled>审核记账</button>
                </el-tooltip>
                <button v-else class="action-btn success" @click="approveRow(row)">审核记账</button>
                <button v-if="canAudit" class="action-btn danger" @click="rejectRow(row)">驳回</button>
              </template>
              <template v-else-if="row.status === 2">
                <button v-if="canAudit" class="action-btn warn" @click="cancelAuditRow(row)">反审核</button>
                <button v-if="canCreate" class="action-btn danger" @click="openRedFlush(row)">红冲</button>
                <button v-if="canCreate" class="action-btn" @click="copyRow(row)">复制</button>
                <button class="action-btn" @click="printVoucher(row)">打印</button>
              </template>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无凭证" description="点击右上角『录入凭证』开始记账">
            <template #action>
              <el-button v-if="auth.hasPerm('voucher:create')" type="primary" :icon="Plus" @click="$router.push('/vouchers/new')">
                录入凭证
              </el-button>
            </template>
          </EmptyState>
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="loadList"
          @size-change="search"
        />
      </div>
    </SectionCard>

    <!-- 红冲 -->
    <el-dialog v-model="redVisible" title="红冲凭证" width="min(92vw, 440px)" destroy-on-close>
      <el-alert type="warning" :closable="false" class="red-tip"
        title="将生成一张与原凭证借贷方向相反的红字凭证,原凭证保持不变。" />
      <el-form label-width="80px">
        <el-form-item label="红字日期">
          <el-date-picker v-model="redDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="redVisible = false">取消</el-button>
        <el-button type="danger" :loading="redLoading" @click="doRedFlush">确认红冲</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, Refresh, RefreshLeft, Notebook, Document, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import {
  voucherList,
  voucherDelete,
  voucherSubmit,
  voucherApprove,
  voucherReject,
  voucherCancelAudit,
  voucherVoid,
  voucherRedFlush,
  periodList,
  voucherDetail,
} from '@/api/modules'
import { fmtMoney, fmtDate, voucherNo, VOUCHER_STATUS, SOURCE_TYPES, printHtml } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const router = useRouter()
const auth = useAuthStore()

const canCreate = computed(() => auth.hasPerm('voucher:create'))
const canAudit = computed(() => auth.hasPerm('voucher:audit'))
function canAuditSame(row: any) {
  return canAudit.value && row.createdBy !== auth.user?.id
}

const loading = ref(false)
const list = ref<any[]>([])
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/vouchers',
      filename: '凭证列表',
      params: { ...query, page: undefined, pageSize: undefined },
      loadingText: '凭证列表 Excel',
    })
  } finally {
    exporting.value = false
  }
}
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const periods = ref<any[]>([])
const dateRange = ref<[string, string] | null>(null)

const query = reactive<{ periodId?: number; status?: number; keyword?: string; minAmount?: number | undefined; maxAmount?: number | undefined }>({})

function periodLabel(p: any) {
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

async function loadPeriods() {
  try {
    const res: any = await periodList()
    periods.value = res.list || []
    if (!query.periodId && periods.value.length) {
      const open = [...periods.value].reverse().find((p) => p.status !== 2)
      query.periodId = (open || periods.value[periods.value.length - 1]).id
    }
  } catch { /* ignore */ }
}

async function copyRow(row: any) {
  try {
    const v: any = await voucherDetail(row.id)
    sessionStorage.setItem('fm_voucher_copy', JSON.stringify({
      word: v.word || '记',
      memo: v.memo || '',
      entries: (v.entries || []).map((e: any) => ({
        summary: e.summary || '', subjectId: e.subjectId ?? null,
        debit: Number(e.debit) > 0 ? Number(e.debit) : undefined,
        credit: Number(e.credit) > 0 ? Number(e.credit) : undefined,
        partnerId: e.partnerId ?? null, departmentId: e.departmentId ?? null, projectId: e.projectId ?? null,
        settleType: e.settleType ?? null, settleNo: e.settleNo ?? null,
      })),
    }))
    ElMessage.success('分录已复制,请在新凭证页确认保存')
    router.push('/vouchers/new')
  } catch { /* 拦截器已提示 */ }
}

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: page.value,
      pageSize: pageSize.value,
      ...query,
    }
    if (dateRange.value?.[0]) params.dateFrom = dateRange.value[0]
    if (dateRange.value?.[1]) params.dateTo = dateRange.value[1]
    const res: any = await voucherList(params)
    list.value = res.list || []
    total.value = res.total || 0
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  loadList()
}

/** 展开行时按需加载分录(性能优化:列表不再全量带 entries) */
async function onExpand(row: any, expanded: any[]) {
  if (!expanded.length) return
  if (row.entries && row.entries.length) return
  row.__loadingEntries = true
  try {
    const d: any = await voucherDetail(row.id)
    row.entries = d.entries || []
  } catch {
    /* 拦截器已提示 */
  } finally {
    row.__loadingEntries = false
  }
}

function reset() {
  query.periodId = undefined
  query.status = undefined
  query.keyword = undefined
  query.minAmount = undefined
  query.maxAmount = undefined
  dateRange.value = null
  search()
}

// ---------- 概览条计算 ----------
const totalDebitFmt = computed(() => fmtMoney(list.value.reduce((a, r) => a + Number(r.totalDebit || 0), 0)))
const totalCreditFmt = computed(() => fmtMoney(list.value.reduce((a, r) => a + Number(r.totalCredit || 0), 0)))
const statusSummary = computed(() => {
  const m: Record<number, number> = {}
  for (const r of list.value) m[r.status] = (m[r.status] || 0) + 1
  return m
})

// ---------- 行操作 ----------
async function submitRow(row: any) {
  await ElMessageBox.confirm(`确认提交凭证 ${voucherNo(row.word, row.no)} 进入审核流程?`, '提交', { type: 'warning' })
  try {
    await voucherSubmit(row.id)
    ElMessage.success('已提交审核')
    loadList()
  } catch { /* ignore */ }
}

async function removeRow(row: any) {
  await ElMessageBox.confirm(`确认删除草稿凭证 ${voucherNo(row.word, row.no)}?删除后不可恢复。`, '删除', { type: 'warning' })
  try {
    await voucherDelete(row.id)
    ElMessage.success('已删除')
    loadList()
  } catch { /* ignore */ }
}

async function voidRow(row: any) {
  await ElMessageBox.confirm(`确认作废凭证 ${voucherNo(row.word, row.no)}?作废后不可恢复。`, '作废', { type: 'warning' })
  try {
    await voucherVoid(row.id)
    ElMessage.success('已作废')
    loadList()
  } catch { /* ignore */ }
}

async function approveRow(row: any) {
  await ElMessageBox.confirm(
    `确认审核记账凭证 ${voucherNo(row.word, row.no)}(合计 ${fmtMoney(row.totalDebit)} 元)?`,
    '审核记账',
    { type: 'warning' },
  )
  try {
    await voucherApprove(row.id)
    ElMessage.success('审核记账完成')
    loadList()
  } catch { /* ignore */ }
}

async function rejectRow(row: any) {
  let reason: string | undefined
  try {
    const res = await ElMessageBox.prompt('请输入驳回原因', `驳回 ${voucherNo(row.word, row.no)}`, {
      inputValidator: (v: string) => (v && v.trim() ? true : '驳回原因不能为空'),
    })
    reason = res.value.trim()
  } catch {
    return
  }
  try {
    await voucherReject(row.id, reason!)
    ElMessage.success('已驳回,凭证退回草稿')
    loadList()
  } catch { /* ignore */ }
}

async function cancelAuditRow(row: any) {
  await ElMessageBox.confirm(
    `反审核后凭证将退回草稿状态,确认取消 ${voucherNo(row.word, row.no)} 的记账?`,
    '反审核',
    { type: 'warning' },
  )
  try {
    await voucherCancelAudit(row.id)
    ElMessage.success('已反审核')
    loadList()
  } catch { /* ignore */ }
}

// ---------- 红冲 ----------
const redVisible = ref(false)
const redLoading = ref(false)
const redDate = ref('')
let redRow: any = null

function openRedFlush(row: any) {
  redRow = row
  redDate.value = fmtDate(new Date())
  redVisible.value = true
}

async function doRedFlush() {
  if (!redDate.value) {
    ElMessage.warning('请选择红字凭证日期')
    return
  }
  redLoading.value = true
  try {
    await voucherRedFlush(redRow.id, redDate.value)
    ElMessage.success('红冲凭证已生成')
    redVisible.value = false
    loadList()
  } catch { /* 拦截器已提示 */ } finally {
    redLoading.value = false
  }
}

// ---------- 打印 ----------
async function printVoucher(row: any) {
  try {
    const v: any = await voucherDetail(row.id)
    const tenantName = auth.currentTenantName
    const rowsHtml = (v.entries || [])
      .map(
        (e: any, i: number) => `<tr>
          <td class="c">${i + 1}</td>
          <td>${e.summary ?? ''}</td>
          <td>${e.subject ? `${e.subject.code} ${e.subject.name}` : ''}</td>
          <td class="r">${Number(e.debit) ? Number(e.debit).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : ''}</td>
          <td class="r">${Number(e.credit) ? Number(e.credit).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : ''}</td>
        </tr>`,
      )
      .join('')
    const body = `
      <h1>${tenantName || ''}　记账凭证</h1>
      <div class="meta">
        <span>${v.word}字第 ${v.no} 号</span>
        <span>日期:${fmtDate(v.date)}</span>
        <span>附单据 ${v.attachmentCount ?? 0} 张</span>
      </div>
      <table>
        <thead><tr><th style="width:36px">行</th><th style="width:30%">摘要</th><th>会计科目</th><th class="r" style="width:16%">借方金额</th><th class="r" style="width:16%">贷方金额</th></tr></thead>
        <tbody>${rowsHtml}
          <tr>
            <td colspan="3" class="r"><b>合　计</b></td>
            <td class="r"><b>${fmtMoney(v.totalDebit)}</b></td>
            <td class="r"><b>${fmtMoney(v.totalCredit)}</b></td>
          </tr>
        </tbody>
      </table>
      <div class="sign">
        <span>制单:${v.creator?.realName ?? ''}</span>
        <span>审核:${v.auditor?.realName ?? ''}</span>
        <span>记账:</span>
        <span>出纳:</span>
      </div>`
    printHtml(`记账凭证-${voucherNo(v.word, v.no)}`, body)
  } catch { /* 拦截器已提示 */ }
}

onMounted(() => {
  loadPeriods()
  loadList()
})
</script>

<style scoped>
.voucher-list { display: flex; flex-direction: column; gap: 18px; }

/* 概览条 */
.overview-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: var(--fm-radius-md);
  padding: 4px;
  box-shadow: var(--fm-shadow-sm);
}
.ov-item {
  flex: 1 1 200px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.ov-item + .ov-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 16px;
  bottom: 16px;
  width: 1px;
  background: var(--fm-border-soft);
}
.ov-label { font-size: 12px; color: var(--fm-text-3); font-weight: 500; letter-spacing: 0.02em; }
.ov-num {
  font-size: 22px;
  font-weight: 700;
  font-family: var(--fm-font-num);
  color: var(--fm-text-1);
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.ov-suffix { font-size: 12px; color: var(--fm-text-3); }
.text-brand { color: var(--fm-brand-600); }

.ov-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.ov-tag {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: var(--fm-radius-pill);
  font-weight: 500;
}
.ov-tag.tag-success { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.ov-tag.tag-warning { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
.ov-tag.tag-danger  { background: var(--fm-danger-soft);  color: var(--fm-danger-ink); }
.ov-tag.tag-info    { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }

/* 凭证号 + 状态 pill */
.voucher-no {
  font-family: var(--fm-font-num);
  font-weight: 600;
  color: var(--fm-text-1);
  font-size: 13px;
  padding: 4px 10px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  display: inline-block;
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
.status-pill.pill-danger  { background: var(--fm-danger-soft);  color: var(--fm-danger-ink); }
.status-pill.pill-info    { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }

.source-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-xs);
  background: rgba(99,102,241,0.08);
  color: var(--fm-brand-600);
  white-space: nowrap;
}
html.dark .source-tag { background: rgba(129,140,248,0.12); color: var(--fm-brand-300); }

/* 行操作按钮 */
.row-actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.action-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 0 10px;
  height: 24px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--fm-border-soft);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-xs);
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--fm-dur-base) var(--fm-ease),
              border-color var(--fm-dur-base) var(--fm-ease),
              background var(--fm-dur-base) var(--fm-ease);
  font-family: inherit;
}
.action-btn:hover:not(:disabled) {
  color: var(--fm-brand-600);
  border-color: var(--fm-brand-300);
  background: rgba(99,102,241,0.04);
  /* 注意: 不要 transform: translateY(-1px) — 会让文字在 hover 过渡时上下抖,看起来像"字体重叠" */
}
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.success:hover:not(:disabled) { color: var(--fm-success); border-color: rgba(16,185,129,0.4); background: var(--fm-success-soft); }
.action-btn.danger:hover:not(:disabled)  { color: var(--fm-danger);  border-color: rgba(239,68,68,0.4);  background: var(--fm-danger-soft); }
.action-btn.warn:hover:not(:disabled)   { color: var(--fm-warning); border-color: rgba(245,158,11,0.4); background: var(--fm-warning-soft); }

/* 展开行 */
.entries-wrap { padding: 12px 36px 16px 44px; }
.entries-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fm-text-2);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}
.entry-mini {
  border-radius: var(--fm-radius-sm);
  overflow: hidden;
}

/* 分页 */
.pager {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--fm-border-soft);
}

.red-tip { margin-bottom: 14px; }

.voucher-filter { border: none; background: var(--fm-bg-muted); border-radius: 0; }
</style>
