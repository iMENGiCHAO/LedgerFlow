<template>
  <div class="claim-approve">
    <PageHeader
      :icon="Finished"
      icon-tone="warning"
      title="报销审批"
      sub="部门 → 总经理 → 财务复核 → 出纳付款 · 多级审批流可配置金额阈值"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <FilterBar>
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 160px">
          <el-option v-for="(v, k) in CLAIM_STATUS" :key="k" :label="v.label" :value="Number(k)" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="按事由关键字搜索"
          clearable
          :prefix-icon="Search"
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
        <template #extra>
          <span v-if="pendingCount > 0" class="filter-meta pending">
            <el-icon :size="13"><BellFilled /></el-icon>
            待处理 {{ pendingCount }} 笔
          </span>
        </template>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="claims-table">
        <el-table-column label="单号" width="160">
          <template #default="{ row }">
            <span class="code-cell">{{ row.claimNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="事由" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="name-cell">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="100">
          <template #default="{ row }">{{ row.applicant?.realName || '-' }}</template>
        </el-table-column>
        <el-table-column label="部门" width="120">
          <template #default="{ row }">
            <span v-if="row.dept?.name" class="dept-pill">{{ row.dept.name }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            <span class="num-cell text-brand">¥ {{ fmtMoney(row.total) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default="{ row }">
            <span class="status-pill" :class="`pill-${CLAIM_STATUS[row.status]?.tag || 'info'}`">
              <span class="pill-dot" />
              {{ CLAIM_STATUS[row.status]?.label || row.status }}
            </span>
            <div class="node-text">{{ row.currentNode || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="付款凭证" width="130">
          <template #default="{ row }">
            <span v-if="row.payVoucher" class="voucher-no-cell">{{ row.payVoucher.word }}-{{ row.payVoucher.no }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">
            <span class="num-mono">{{ fmtDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="right" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <button v-if="[1, 2, 3].includes(row.status) && auth.hasPerm('expense:approve')" class="action-btn success" @click="approveRow(row)">通过</button>
              <button v-if="[1, 2, 3].includes(row.status) && auth.hasPerm('expense:approve')" class="action-btn danger" @click="rejectRow(row)">驳回</button>
              <button v-if="row.status === 4 && auth.hasPerm('expense:pay')" class="action-btn warn" @click="openPay(row)">付款</button>
              <button class="action-btn" @click="openDetail(row)">详情</button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="队列已清空" description="暂无待处理的报销单 · 喝杯咖啡歇会儿 ☕" />
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

    <!-- 报销付款 -->
    <el-dialog v-model="payVisible" title="报销付款" width="min(92vw, 480px)" destroy-on-close>
      <el-alert
        v-if="payRow"
        type="info"
        :closable="false"
        class="pay-tip"
        :title="`${payRow.claimNo} ${payRow.title} · 应付金额 ${fmtMoney(payRow.total)} 元`"
      />
      <el-form label-width="92px">
        <el-form-item label="资金科目" required>
          <el-select v-model="payForm.settleSubjectCode" placeholder="请选择结算资金科目" style="width: 100%">
            <el-option v-for="s in cashSubjects" :key="s.code" :label="`${s.code} ${s.name}`" :value="s.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算方式">
          <el-select v-model="payForm.settleType" placeholder="可不填" clearable style="width: 100%">
            <el-option v-for="t in SETTLE_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="付款日期" required>
          <el-date-picker
            v-model="payForm.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payVisible = false">取消</el-button>
        <el-button type="primary" :loading="paySaving" @click="doPay">确认付款</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="报销单详情" size="45%" class="detail-drawer">
      <div v-loading="detailLoading" class="drawer-body">
        <template v-if="detail">
          <div class="phase-banner" :class="`phase-${CLAIM_PHASE[detail.status]?.tone || 'in-progress'}`">
            <div class="phase-icon">
              <el-icon v-if="detail.status === 5"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="detail.status === 6"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="detail.status === 7"><RefreshLeft /></el-icon>
              <el-icon v-else><Loading /></el-icon>
            </div>
            <div class="phase-text">
              <div class="phase-title">{{ CLAIM_PHASE[detail.status]?.label || '处理中' }}</div>
              <div class="phase-sub">{{ detail.currentNode || '-' }}</div>
            </div>
            <div v-if="detail.paidAt" class="phase-meta">
              <div class="meta-row"><span>付款时间</span><b>{{ fmtDateTime(detail.paidAt) }}</b></div>
              <div v-if="detail.payVoucher" class="meta-row">
                <span>付款凭证</span>
                <b>{{ detail.payVoucher.word }}-{{ detail.payVoucher.no }}</b>
              </div>
            </div>
          </div>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="单号">{{ detail.claimNo || '-' }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="CLAIM_STATUS[detail.status]?.tag || 'info'" size="small">
                {{ CLAIM_STATUS[detail.status]?.label || detail.status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="事由" :span="2">{{ detail.title || '-' }}</el-descriptions-item>
            <el-descriptions-item label="申请人">{{ detail.applicant?.realName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="部门">{{ detail.dept?.name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="金额(元)">
              <b class="num-cell">{{ fmtMoney(detail.total) }}</b>
            </el-descriptions-item>
            <el-descriptions-item label="当前节点">{{ detail.currentNode || '-' }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.rejectReason" label="驳回原因" :span="2">
              <span class="reject-text">{{ detail.rejectReason }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="付款凭证">
              {{ detail.payVoucher ? `${detail.payVoucher.word}-${detail.payVoucher.no}` : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="申请时间">{{ fmtDateTime(detail.createdAt) }}</el-descriptions-item>
          </el-descriptions>

          <div class="section-title">费用明细</div>
          <el-table :data="detail.items || []" border size="small">
            <el-table-column type="index" label="#" width="46" align="center" />
            <el-table-column label="费用类型" prop="expenseType" min-width="100" align="center" />
            <el-table-column label="发生日期" width="108" align="center">
              <template #default="{ row }">{{ fmtDate(row.occurDate) }}</template>
            </el-table-column>
            <el-table-column label="金额(元)" width="112" align="right">
              <template #default="{ row }"><span class="num-cell">{{ fmtMoney(row.amount) }}</span></template>
            </el-table-column>
            <el-table-column label="发票张数" width="90" align="center">
              <template #default="{ row }">{{ row.invoiceCount ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="备注" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.remark || '-' }}</template>
            </el-table-column>
            <template #empty><el-empty description="本单暂无费用明细" :image-size="60" /></template>
          </el-table>

          <div class="section-title">审批流程图</div>
          <div class="flow-diagram" :class="`flow-status-${detail.status}`">
            <div class="flow-nodes">
              <div
                v-for="(n, i) in FLOW_NODES"
                :key="n.code"
                class="flow-node"
                :class="getNodeState(detail.status, n.code)"
              >
                <div class="node-circle">
                  <el-icon v-if="n.icon"><component :is="n.icon" /></el-icon>
                  <span v-else>{{ i + 1 }}</span>
                </div>
                <div class="node-label">{{ n.label }}</div>
                <div v-if="n.subLabel" class="node-sub">{{ n.subLabel }}</div>
              </div>
              <div class="flow-line" />
            </div>
            <div v-if="detail.status === 6" class="flow-branch flow-branch-rejected">
              <el-icon><CircleCloseFilled /></el-icon>
              <span>流程在 <b>{{ rejectStageName(detail) }}</b> 被驳回:{{ detail.rejectReason || '无' }}</span>
            </div>
            <div v-if="detail.status === 7" class="flow-branch flow-branch-withdrawn">
              <el-icon><RefreshLeft /></el-icon>
              <span>申请人主动撤回</span>
            </div>
            <div v-if="detail.status === 5" class="flow-branch flow-branch-finished">
              <el-icon><CircleCheckFilled /></el-icon>
              <span>流程已完结 · 付款 ¥{{ fmtMoney(detail.total) }} · 凭证 {{ detail.payVoucher ? detail.payVoucher.word + '-' + detail.payVoucher.no : '-' }}</span>
            </div>
          </div>

          <div class="section-title">流转记录</div>
          <el-timeline v-if="(detail.approvals || []).length" class="flow-timeline">
            <el-timeline-item
              v-for="(a, i) in detail.approvals"
              :key="i"
              :timestamp="fmtDateTime(a.createdAt)"
              placement="top"
            >
              <span>{{ a.approverName || '-' }} · {{ ACTION_NAMES[a.action] || a.action }}</span>
              <div v-if="a.opinion" class="opinion">{{ a.opinion }}</div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="单据提交后,将在此记录每一步审批流转" :image-size="60" />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, markRaw } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, RefreshLeft, Finished, BellFilled, CircleCheckFilled, CircleCloseFilled, Loading, Plus, EditPen, Wallet, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { claimList, claimDetail, claimDecide, claimPay, subjectTree } from '@/api/modules'
import { fmtMoney, fmtDate, fmtDateTime, CLAIM_STATUS, CLAIM_PHASE, SETTLE_TYPES } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const auth = useAuthStore()

/** 流转动作中文映射 */
const ACTION_NAMES: Record<string, string> = {
  submit: '提交',
  approve: '通过',
  reject: '驳回',
  review: '复核',
  pay: '付款',
  withdraw: '撤回',
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ==================== 列表 ====================
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = reactive<{ status?: number | ''; keyword: string }>({ status: '', keyword: '' })
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/expense-claims',
      filename: '报销单',
      params: { status: query.status || undefined, keyword: query.keyword.trim() || undefined, page: undefined, pageSize: undefined },
      loadingText: '报销单 Excel',
    })
  } finally {
    exporting.value = false
  }
}

/** 本页待处理笔数(status 1-4:待部门审批/待总经理审批/待财务复核/待付款) */
const pendingCount = computed(() =>
  list.value.filter((r) => Number(r.status) >= 1 && Number(r.status) <= 4).length,
)

/* ============ 流程图 5 节点 ============ */
const FLOW_NODES = [
  { code: 'draft',    label: '员工提交',    subLabel: '草稿',          icon: markRaw(Plus) },
  { code: 'boss',     label: '总经理审批',  subLabel: '≥ ¥5000 必走',  icon: markRaw(Finished) },
  { code: 'finance',  label: '财务复核',    subLabel: '票面核验',      icon: markRaw(EditPen) },
  { code: 'cashier',  label: '出纳付款',    subLabel: '选资金科目',    icon: markRaw(Wallet) },
  { code: 'done',     label: '已付款',      subLabel: '生成凭证',      icon: markRaw(CircleCheckFilled) },
] as const

function getNodeState(status: number, code: string): string {
  if (status === 0) return code === 'draft' ? 'active' : 'pending'
  if (status === 1) {
    if (code === 'draft') return 'passed'
    if (code === 'boss') return 'active'
    return 'pending'
  }
  if (status === 2 || status === 3) {
    if (code === 'draft') return 'passed'
    if (code === 'finance') return 'active'
    if (code === 'boss') return 'skipped'
    return 'pending'
  }
  if (status === 4) {
    if (code === 'draft' || code === 'finance') return 'passed'
    if (code === 'cashier') return 'active'
    if (code === 'boss') return 'skipped'
    return 'pending'
  }
  if (status === 5) {
    if (code === 'done' || code === 'cashier' || code === 'finance' || code === 'draft') return 'passed'
    if (code === 'boss') return 'skipped'
    return 'pending'
  }
  if (status === 6) {
    if (code === 'draft') return 'passed'
    if (code === 'boss' && detail.value?.currentNode?.includes('总经理')) return 'rejected'
    if (code === 'finance' && detail.value?.currentNode?.includes('财务')) return 'rejected'
    if (code === 'cashier' && detail.value?.currentNode?.includes('出纳')) return 'rejected'
    return 'pending'
  }
  if (status === 7) {
    if (code === 'draft') return 'passed'
    return 'pending'
  }
  return 'pending'
}

function rejectStageName(d: any): string {
  const cn = d?.currentNode || ''
  if (cn.includes('总经理')) return '总经理审批'
  if (cn.includes('财务')) return '财务复核'
  if (cn.includes('出纳')) return '出纳付款'
  return '审批环节'
}

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, unknown> = { page: page.value, pageSize: pageSize.value }
    if (query.status !== '' && query.status !== null && query.status !== undefined) params.status = query.status
    if (query.keyword.trim()) params.keyword = query.keyword.trim()
    const res: any = await claimList(params)
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

function reset() {
  query.status = ''
  query.keyword = ''
  search()
}

// ==================== 审批(通过 / 驳回) ====================
async function approveRow(row: any) {
  await ElMessageBox.confirm(
    `确认通过报销单 ${row.claimNo}(申请人:${row.applicant?.realName || '-'},金额 ${fmtMoney(row.total)} 元)?`,
    '审批通过',
    { type: 'warning' },
  )
  try {
    await claimDecide(row.id, 'approve')
    ElMessage.success('审批已通过')
    loadList()
  } catch {
    /* 拦截器已提示 */
  }
}

async function rejectRow(row: any) {
  let opinion: string | undefined
  try {
    const res = await ElMessageBox.prompt('请输入驳回意见', `驳回 ${row.claimNo}`, {
      inputPlaceholder: '如:发票抬头与公司名称不符,请更换后重新提交',
      inputValidator: (v: string) => (v && v.trim() ? true : '驳回意见不能为空'),
    })
    opinion = res.value.trim()
  } catch {
    return
  }
  try {
    await claimDecide(row.id, 'reject', opinion!)
    ElMessage.success('已驳回,单据退回申请人')
    loadList()
  } catch {
    /* 拦截器已提示 */
  }
}

// ==================== 付款 ====================
const subjects = ref<any[]>([])
let subjectsLoaded = false

function collectLeaves(nodes: any[], out: any[] = []): any[] {
  nodes.forEach((n) => {
    if (n.children && n.children.length) collectLeaves(n.children, out)
    else out.push(n)
  })
  return out
}

async function ensureSubjects() {
  if (subjectsLoaded) return
  try {
    const res: any = await subjectTree()
    const flat: any[] = Array.isArray(res.list) && res.list.length ? res.list : collectLeaves(res.tree || [])
    subjects.value = flat.filter((s: any) => s.isLeaf && String(s.code).startsWith('1002'))
    subjectsLoaded = true
  } catch {
    /* 拦截器已提示 */
  }
}

const cashSubjects = computed(() => subjects.value)

const payVisible = ref(false)
const paySaving = ref(false)
const payRow = ref<any>(null)
const payForm = reactive<{ settleSubjectCode: string; settleType: string; date: string }>({
  settleSubjectCode: '100201',
  settleType: '',
  date: '',
})

async function openPay(row: any) {
  payRow.value = row
  payForm.settleSubjectCode = '100201'
  payForm.settleType = ''
  payForm.date = todayStr()
  payVisible.value = true
  await ensureSubjects()
}

async function doPay() {
  if (!payForm.settleSubjectCode) {
    ElMessage.warning('请选择结算资金科目')
    return
  }
  if (!payForm.date) {
    ElMessage.warning('请选择付款日期')
    return
  }
  paySaving.value = true
  try {
    const data: Record<string, unknown> = {
      settleSubjectCode: payForm.settleSubjectCode,
      date: payForm.date,
    }
    if (payForm.settleType) data.settleType = payForm.settleType
    await claimPay(payRow.value.id, data as any)
    ElMessage.success('付款完成,已生成付款凭证')
    payVisible.value = false
    loadList()
  } catch {
    /* 拦截器已提示 */
  } finally {
    paySaving.value = false
  }
}

// ==================== 详情抽屉 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<any>(null)

async function openDetail(row: any) {
  detail.value = null
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await claimDetail(row.id)
  } catch {
    /* 拦截器已提示 */
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  loadList()
  ensureSubjects()
})
</script>

<style scoped>
.claim-approve { display: flex; flex-direction: column; gap: 18px; }

/* ============ 报销单流程阶段横幅(同 MyClaims) ============ */
.phase-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  margin-bottom: 14px;
  position: relative;
  overflow: hidden;
  border: 1px solid transparent;
}
.phase-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--fm-bg-elevated);
  opacity: 0.85;
  z-index: 0;
}
.phase-banner > * { position: relative; z-index: 1; }
.phase-banner .phase-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}
.phase-banner .phase-text { flex: 1; min-width: 0; }
.phase-banner .phase-title { font-size: 16px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.3; }
.phase-banner .phase-sub { font-size: 12px; margin-top: 4px; opacity: 0.8; }
.phase-banner .phase-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; text-align: right; }
.phase-banner .phase-meta .meta-row { display: flex; gap: 8px; justify-content: flex-end; }
.phase-banner .phase-meta .meta-row span { opacity: 0.65; }
.phase-banner .phase-meta .meta-row b { font-weight: 600; }
.phase-banner.phase-draft { background: linear-gradient(135deg, rgba(148,163,184,0.10), rgba(148,163,184,0.04)); border-color: rgba(148,163,184,0.25); color: var(--fm-text-2); }
.phase-banner.phase-draft .phase-icon { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }
.phase-banner.phase-in-progress { background: linear-gradient(135deg, rgba(99,102,241,0.10), rgba(59,130,246,0.05)); border-color: rgba(99,102,241,0.25); color: var(--fm-brand-700); }
.phase-banner.phase-in-progress .phase-icon { background: rgba(99,102,241,0.15); color: var(--fm-brand-600); }
.phase-banner.phase-finished { background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(34,197,94,0.05)); border-color: rgba(16,185,129,0.30); color: #047857; }
.phase-banner.phase-finished .phase-icon { background: rgba(16,185,129,0.18); color: #047857; }
.phase-banner.phase-rejected { background: linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04)); border-color: rgba(239,68,68,0.25); color: var(--fm-danger-ink); }
.phase-banner.phase-rejected .phase-icon { background: rgba(239,68,68,0.15); color: var(--fm-danger-ink); }
.phase-banner.phase-withdrawn { background: linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04)); border-color: rgba(245,158,11,0.25); color: #b45309; }
.phase-banner.phase-withdrawn .phase-icon { background: rgba(245,158,11,0.15); color: #b45309; }
html.dark .phase-banner.phase-finished { color: #34d399; }
html.dark .phase-banner.phase-finished .phase-icon { color: #34d399; }
html.dark .phase-banner.phase-in-progress { color: #a5b4fc; }
html.dark .phase-banner.phase-in-progress .phase-icon { color: #a5b4fc; }
.filter-meta { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); font-weight: 500; }
.filter-meta.pending {
  color: var(--fm-warning);
  background: var(--fm-warning-soft);
  padding: 4px 12px;
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
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }
.text-brand { color: var(--fm-brand-600); }

.dept-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-pill);
  background: rgba(99,102,241,0.10);
  color: var(--fm-brand-600);
}
html.dark .dept-pill { color: var(--fm-brand-300); }

.voucher-no-cell {
  font-family: var(--fm-font-num);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
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
.status-pill.pill-danger { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }
.status-pill.pill-info { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }
.status-pill.pill-primary { background: rgba(99,102,241,0.10); color: var(--fm-brand-600); }
html.dark .status-pill.pill-primary { color: var(--fm-brand-300); }

.node-text { color: var(--fm-text-3); font-size: 11px; line-height: 1.4; margin-top: 4px; }

.row-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.action-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--fm-border-soft);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-xs);
  cursor: pointer;
  transition: all var(--fm-dur-base) var(--fm-ease);
  font-family: inherit;
}
.action-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); background: rgba(99,102,241,0.04); }
.action-btn.success:hover { color: var(--fm-success); border-color: rgba(16,185,129,0.4); background: var(--fm-success-soft); }
.action-btn.danger:hover { color: var(--fm-danger); border-color: rgba(239,68,68,0.4); background: var(--fm-danger-soft); }
.action-btn.warn:hover { color: var(--fm-warning); border-color: rgba(245,158,11,0.4); background: var(--fm-warning-soft); }

.pay-tip { margin-bottom: 14px; }
.pager { padding: 14px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--fm-border-soft); }
.drawer-body { min-height: 240px; padding: 4px 0; }
.section-title { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--fm-text-3); margin: 20px 0 10px; text-transform: uppercase; }

/* ============ 审批流程图 5 节点(同 MyClaims) ============ */
.flow-diagram {
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: 12px;
  padding: 24px 18px 18px;
  margin-bottom: 16px;
  position: relative;
}
.flow-nodes { display: flex; justify-content: space-between; align-items: flex-start; position: relative; padding: 0 4px; }
.flow-line { position: absolute; top: 22px; left: 8%; right: 8%; height: 2px; background: var(--fm-border-soft); z-index: 0; }
.flow-node { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.flow-node .node-circle {
  width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--fm-bg-muted); border: 2px solid var(--fm-border-soft); color: var(--fm-text-3);
  font-size: 14px; font-weight: 600; transition: all 0.2s ease;
}
.flow-node .node-label { font-size: 12px; font-weight: 600; color: var(--fm-text-3); text-align: center; white-space: nowrap; }
.flow-node .node-sub { font-size: 10px; color: var(--fm-text-3); text-align: center; white-space: nowrap; opacity: 0.7; }
.flow-node.passed .node-circle { background: var(--fm-success-soft); border-color: var(--fm-success); color: var(--fm-success); }
.flow-node.passed .node-label { color: var(--fm-text-1); }
.flow-node.active .node-circle {
  background: var(--fm-brand-500); border-color: var(--fm-brand-500); color: #fff;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); animation: pulse 2s ease-in-out infinite;
}
.flow-node.active .node-label { color: var(--fm-brand-600); font-weight: 700; }
.flow-node.active .node-sub { color: var(--fm-brand-500); opacity: 1; }
.flow-node.skipped .node-circle { background: var(--fm-bg-muted); border-color: var(--fm-border-soft); border-style: dashed; color: var(--fm-text-3); opacity: 0.5; }
.flow-node.skipped .node-label { opacity: 0.5; text-decoration: line-through; }
.flow-node.skipped .node-sub { opacity: 0.4; }
.flow-node.rejected .node-circle { background: var(--fm-danger-soft); border-color: var(--fm-danger); color: var(--fm-danger); animation: shake 0.5s ease-in-out; }
.flow-node.rejected .node-label { color: var(--fm-danger-ink); font-weight: 700; }
.flow-node.pending .node-circle { background: var(--fm-bg-muted); border-color: var(--fm-border-soft); color: var(--fm-text-3); }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); } 50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.05); } }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
.flow-branch { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; }
.flow-branch-rejected { background: rgba(239, 68, 68, 0.08); color: var(--fm-danger-ink); border: 1px solid rgba(239, 68, 68, 0.20); }
.flow-branch-withdrawn { background: rgba(245, 158, 11, 0.08); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.20); }
.flow-branch-finished { background: rgba(16, 185, 129, 0.10); color: #047857; border: 1px solid rgba(16, 185, 129, 0.25); }
html.dark .flow-branch-finished { color: #34d399; }
html.dark .flow-branch-rejected { color: #f87171; }
.flow-timeline { padding-left: 4px; font-size: 13px; color: var(--fm-text-1); }
.flow-timeline :deep(.el-timeline-item__timestamp) { font-size: 12px; }
.opinion { color: var(--fm-text-3); font-size: 12px; margin-top: 4px; white-space: pre-wrap; }
.reject-text { color: var(--fm-danger); }
.pending-tip { display: none; }

@media (max-width: 1023px) {
  .detail-drawer { --el-drawer-size: 90%; width: 90% !important; }
}
</style>
