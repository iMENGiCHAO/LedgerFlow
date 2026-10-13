<template>
  <div class="my-claims">
    <PageHeader
      :icon="Money"
      icon-tone="success"
      title="我的报销"
      sub="报销申请与进度跟踪 · 多级审批 · 出纳付款自动生成凭证"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建报销单</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <template #actions>
        <span class="filter-meta">
          <el-icon :size="13"><InfoFilled /></el-icon>
          共 {{ total }} 张 · 合计 ¥ {{ totalAmountFmt }}
        </span>
      </template>

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
        <el-table-column label="操作" width="180" align="right" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <button class="action-btn" @click="openDetail(row)">详情</button>
              <button v-if="[0, 6, 7].includes(row.status)" class="action-btn warn" @click="openEdit(row)">修改</button>
              <button v-if="[0, 6, 7].includes(row.status)" class="action-btn success" :disabled="actingId === row.id" @click="submitRow(row)">提交</button>
              <button v-if="[1, 2, 3].includes(row.status)" class="action-btn danger" :disabled="actingId === row.id" @click="withdrawRow(row)">撤回</button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无报销单" description="点击右上角『新建报销单』发起第一笔申请" />
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

    <!-- 新建报销单 -->
    <el-dialog v-model="createVisible" :title="editingId ? '修改报销单' : '新建报销单'" width="min(92vw, 820px)" destroy-on-close>
      <el-alert
        v-if="!editingId"
        type="info"
        :closable="false"
        show-icon
        class="rule-tip"
        title="财务业务规则"
        description="① 票据张数 ≥ 1;② 报销金额不得超过票面合计(可填票面合计以做核验);③ 发生日期距今 ≤ 180 天;④ 金额 < 5000 直走财务,≥ 5000 须总经理审批。"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" class="claim-form">
        <el-form-item label="费用事由" prop="title">
          <el-input v-model="form.title" placeholder="请输入报销事由,如:3 月出差差旅费报销" maxlength="100" />
        </el-form-item>
        <el-form-item label="费用明细">
          <div class="items-wrap">
            <el-table :data="form.items" border size="small">
              <el-table-column type="index" label="#" width="46" align="center" />
              <el-table-column label="费用类型" min-width="128">
                <template #default="{ $index }">
                  <el-select v-model="form.items[$index].expenseType" placeholder="请选择" style="width: 100%">
                    <el-option v-for="t in EXPENSE_TYPES" :key="t" :label="t" :value="t" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="发生日期" width="152">
                <template #default="{ $index }">
                  <el-date-picker
                    v-model="form.items[$index].occurDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="选择日期"
                    style="width: 100%"
                  />
                </template>
              </el-table-column>
              <el-table-column label="金额(元)" width="172">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.items[$index].amount"
                    :precision="2"
                    :step="100"
                    :min="0"
                    style="width: 100%"
                  />
                </template>
              </el-table-column>
              <el-table-column label="发票张数" width="120">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.items[$index].invoiceCount"
                    :precision="0"
                    :min="0"
                    :step="1"
                    style="width: 100%"
                  />
                </template>
              </el-table-column>
              <el-table-column label="票面合计" width="140">
                <template #default="{ $index }">
                  <el-input-number
                    v-model="form.items[$index].invoiceTotal"
                    :precision="2"
                    :min="0"
                    :step="0.01"
                    placeholder="选填"
                    style="width: 100%"
                  />
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="126">
                <template #default="{ $index }">
                  <el-input v-model="form.items[$index].remark" placeholder="选填" maxlength="100" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="64" align="center">
                <template #default="{ $index }">
                  <el-button
                    link
                    type="danger"
                    :disabled="form.items.length <= 1"
                    @click="removeItem($index)"
                  >删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button class="add-item-btn" link type="primary" :icon="Plus" @click="addItem">添加明细</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <span class="total-text">合计:<b class="total-amount">{{ fmtMoney(itemsTotal) }}</b> 元</span>
          <span>
            <el-button @click="createVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
          </span>
        </div>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="报销单详情" size="45%" class="detail-drawer">
      <div v-loading="detailLoading" class="drawer-body">
        <template v-if="detail">
          <!-- 流程阶段横幅:草稿/进行中/完结/驳回/撤回 5 态 -->
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
          <!-- 5 节点流程图: 草稿 → 总经理 → 财务 → 出纳 → 已付款,驳回/撤回走红色分支 -->
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
            <!-- 驳回/撤回分支(只在终态时显示) -->
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import { Plus, Money, InfoFilled, CircleCheckFilled, CircleCloseFilled, RefreshLeft, Loading, Finished, EditPen, Wallet, Download } from '@element-plus/icons-vue'
import { markRaw } from 'vue'
import { exportExcel } from '@/utils/exporter'
import { claimList, claimDetail, claimCreate, claimUpdate, claimSubmit, claimWithdraw } from '@/api/modules'
import { fmtMoney, fmtDate, fmtDateTime, CLAIM_STATUS, CLAIM_PHASE, EXPENSE_TYPES } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

/** 流转动作中文映射 */
const ACTION_NAMES: Record<string, string> = {
  submit: '提交',
  approve: '通过',
  reject: '驳回',
  review: '复核',
  pay: '付款',
  withdraw: '撤回',
}

/* ============ 流程图 5 节点 ============ */
const FLOW_NODES = [
  { code: 'draft',    label: '员工提交',    subLabel: '草稿',          icon: markRaw(Plus) },
  { code: 'boss',     label: '总经理审批',  subLabel: '≥ ¥5000 必走',  icon: markRaw(Finished) },
  { code: 'finance',  label: '财务复核',    subLabel: '票面核验',      icon: markRaw(EditPen) },
  { code: 'cashier',  label: '出纳付款',    subLabel: '选资金科目',    icon: markRaw(Wallet) },
  { code: 'done',     label: '已付款',      subLabel: '生成凭证',      icon: markRaw(CircleCheckFilled) },
] as const

/** 节点状态:active=当前 / passed=已过 / pending=未到 / skipped=跳过 / rejected=驳回到此 */
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
    if (code === 'boss') return 'skipped'  // 小额跳过总经理
    return 'pending'
  }
  if (status === 4) {
    if (code === 'draft' || code === 'finance') return 'passed'
    if (code === 'cashier') return 'active'
    if (code === 'boss') return 'skipped'
    return 'pending'
  }
  if (status === 5) {
    if (code === 'draft') return 'passed'
    if (code === 'done') return 'passed'
    if (code === 'cashier') return 'passed'
    if (code === 'finance') return 'passed'
    if (code === 'boss') return 'skipped'  // 大额有,小额没;UI 一律灰显
    return 'pending'
  }
  if (status === 6 || status === 7) {
    // 驳回/撤回:看 currentNode 推断在哪个环节
    const node = (typeof status === 'number' && detail.value?.currentNode) || ''
    if (code === 'draft') return 'passed'
    if (status === 6) {
      if (node.includes('总经理') && code === 'boss') return 'rejected'
      if (node.includes('财务') && code === 'finance') return 'rejected'
      if (node.includes('出纳') && code === 'cashier') return 'rejected'
    }
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
const actingId = ref<number | null>(null)
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/expense-claims',
      filename: '我的报销',
      params: { scope: 'mine', page: undefined, pageSize: undefined },
      loadingText: '我的报销 Excel',
    })
  } finally {
    exporting.value = false
  }
}

async function loadList() {
  loading.value = true
  try {
    const res: any = await claimList({ scope: 'mine', page: page.value, pageSize: pageSize.value })
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

/** 提交审批(草稿) */
async function submitRow(row: any) {
  await ElMessageBox.confirm(
    `确认提交报销单 ${row.claimNo}(金额 ${fmtMoney(row.total)} 元)进入审批流程?`,
    '提交审批',
    { type: 'warning' },
  )
  actingId.value = row.id
  try {
    await claimSubmit(row.id)
    ElMessage.success('已提交审批')
    loadList()
  } catch {
    /* 拦截器已提示 */
  } finally {
    actingId.value = null
  }
}

/** 撤回(不可逆,需确认) */
async function withdrawRow(row: any) {
  await ElMessageBox.confirm(
    `确认撤回报销单 ${row.claimNo}?撤回后单据退回草稿,可修改后重新提交。`,
    '撤回',
    { type: 'warning' },
  )
  actingId.value = row.id
  try {
    await claimWithdraw(row.id)
    ElMessage.success('已撤回')
    loadList()
  } catch {
    /* 拦截器已提示 */
  } finally {
    actingId.value = null
  }
}

// ==================== 新建报销单 ====================
interface ItemForm {
  expenseType: string
  occurDate: string
  amount?: number
  invoiceCount?: number
  invoiceTotal?: number
  remark: string
}

const createVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()
const form = reactive<{ title: string; items: ItemForm[] }>({ title: '', items: [] })
const rules: FormRules = {
  title: [{ required: true, message: '请输入费用事由', trigger: 'blur' }],
}

function emptyItem(): ItemForm {
  return { expenseType: '', occurDate: todayStr(), amount: undefined, invoiceCount: 0, invoiceTotal: undefined, remark: '' }
}

function openCreate() {
  editingId.value = null
  form.title = ''
  form.items = [emptyItem()]
  createVisible.value = true
}

/** 修改驳回/草稿/已撤回单据(原 status=6 是死路,现在打通) */
async function openEdit(row: any) {
  try {
    const d: any = await claimDetail(row.id)
    editingId.value = d.id
    form.title = d.title || ''
    form.items = (d.items || []).map((it: any) => ({
      expenseType: it.expenseType,
      occurDate: it.occurDate ? it.occurDate.slice(0, 10) : todayStr(),
      amount: Number(it.amount),
      invoiceCount: it.invoiceCount || 0,
      invoiceTotal: it.invoiceTotal != null ? Number(it.invoiceTotal) : undefined,
      remark: it.remark || '',
    }))
    if (form.items.length === 0) form.items = [emptyItem()]
    createVisible.value = true
  } catch {
    /* 拦截器已提示 */
  }
}

function addItem() {
  form.items.push(emptyItem())
}

function removeItem(idx: number) {
  if (form.items.length <= 1) return
  form.items.splice(idx, 1)
}

const totalAmountFmt = computed(() => fmtMoney(list.value.reduce((s, r) => s + Number(r.total || 0), 0)))

const itemsTotal = computed(() =>
  form.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
)

async function doCreate() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  for (let i = 0; i < form.items.length; i++) {
    const it = form.items[i]
    if (!it.expenseType) {
      ElMessage.warning(`第 ${i + 1} 行请选择费用类型`)
      return
    }
    if (!it.occurDate) {
      ElMessage.warning(`第 ${i + 1} 行请选择发生日期`)
      return
    }
    if (!it.amount || Number(it.amount) <= 0) {
      ElMessage.warning(`第 ${i + 1} 行金额需大于 0`)
      return
    }
  }
  saving.value = true
  let newId: number | null = null
  try {
    const items = form.items.map((it) => ({
      expenseType: it.expenseType,
      occurDate: it.occurDate,
      amount: Number(it.amount),
      invoiceCount: it.invoiceCount ?? 0,
      ...(it.invoiceTotal != null ? { invoiceTotal: Number(it.invoiceTotal) } : {}),
      ...(it.remark && it.remark.trim() ? { remark: it.remark.trim() } : {}),
    }))
    if (editingId.value) {
      // 修改模式
      const res: any = await claimUpdate(editingId.value, { title: form.title.trim(), items })
      newId = res?.id ?? editingId.value
      createVisible.value = false
      editingId.value = null
      ElMessage.success('报销单已修改')
      loadList()
      saving.value = false
      return
    }
    const res: any = await claimCreate({
      title: form.title.trim(),
      items,
    })
    newId = res?.id ?? null
    createVisible.value = false
    ElMessage.success('报销单已保存')
    loadList()
  } catch {
    /* 拦截器已提示 */
    return
  } finally {
    saving.value = false
  }
  // 保存成功后询问是否立即提交审批;取消则留在列表,两种情况均已刷新
  try {
    await ElMessageBox.confirm('是否立即提交审批?', '提交审批', {
      confirmButtonText: '立即提交',
      cancelButtonText: '暂不提交',
      type: 'info',
    })
  } catch {
    return
  }
  if (!newId) return
  actingId.value = newId
  try {
    await claimSubmit(newId)
    ElMessage.success('已提交审批')
  } catch {
    /* 拦截器已提示 */
  } finally {
    actingId.value = null
  }
  loadList()
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

onMounted(loadList)
</script>

<style scoped>
.my-claims { display: flex; flex-direction: column; gap: 18px; }

/* ============ 报销单流程阶段横幅 ============ */
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
.phase-banner .phase-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.3;
}
.phase-banner .phase-sub {
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.8;
}
.phase-banner .phase-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  text-align: right;
}
.phase-banner .phase-meta .meta-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.phase-banner .phase-meta .meta-row span { opacity: 0.65; }
.phase-banner .phase-meta .meta-row b { font-weight: 600; }

/* 5 种 tone 配色 */
.phase-banner.phase-draft {
  background: linear-gradient(135deg, rgba(148,163,184,0.10), rgba(148,163,184,0.04));
  border-color: rgba(148,163,184,0.25);
  color: var(--fm-text-2);
}
.phase-banner.phase-draft .phase-icon {
  background: rgba(148,163,184,0.15);
  color: var(--fm-text-2);
}
.phase-banner.phase-in-progress {
  background: linear-gradient(135deg, rgba(99,102,241,0.10), rgba(59,130,246,0.05));
  border-color: rgba(99,102,241,0.25);
  color: var(--fm-brand-700);
}
.phase-banner.phase-in-progress .phase-icon {
  background: rgba(99,102,241,0.15);
  color: var(--fm-brand-600);
}
.phase-banner.phase-finished {
  background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(34,197,94,0.05));
  border-color: rgba(16,185,129,0.30);
  color: #047857;
}
.phase-banner.phase-finished .phase-icon {
  background: rgba(16,185,129,0.18);
  color: #047857;
}
.phase-banner.phase-rejected {
  background: linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.04));
  border-color: rgba(239,68,68,0.25);
  color: var(--fm-danger-ink);
}
.phase-banner.phase-rejected .phase-icon {
  background: rgba(239,68,68,0.15);
  color: var(--fm-danger-ink);
}
.phase-banner.phase-withdrawn {
  background: linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04));
  border-color: rgba(245,158,11,0.25);
  color: #b45309;
}
.phase-banner.phase-withdrawn .phase-icon {
  background: rgba(245,158,11,0.15);
  color: #b45309;
}
html.dark .phase-banner.phase-finished { color: #34d399; }
html.dark .phase-banner.phase-finished .phase-icon { color: #34d399; }
html.dark .phase-banner.phase-in-progress { color: #a5b4fc; }
html.dark .phase-banner.phase-in-progress .phase-icon { color: #a5b4fc; }

/* ============ 审批流程图 5 节点横向 ============ */
.flow-diagram {
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: 12px;
  padding: 24px 18px 18px;
  margin-bottom: 16px;
  position: relative;
}
.flow-nodes {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  padding: 0 4px;
}
.flow-line {
  position: absolute;
  top: 22px;
  left: 8%;
  right: 8%;
  height: 2px;
  background: var(--fm-border-soft);
  z-index: 0;
}
.flow-node {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.flow-node .node-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fm-bg-muted);
  border: 2px solid var(--fm-border-soft);
  color: var(--fm-text-3);
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
}
.flow-node .node-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--fm-text-3);
  text-align: center;
  white-space: nowrap;
}
.flow-node .node-sub {
  font-size: 10px;
  color: var(--fm-text-3);
  text-align: center;
  white-space: nowrap;
  opacity: 0.7;
}

/* 节点状态:active / passed / pending / skipped / rejected */
.flow-node.passed .node-circle {
  background: var(--fm-success-soft);
  border-color: var(--fm-success);
  color: var(--fm-success);
}
.flow-node.passed .node-label { color: var(--fm-text-1); }
.flow-node.passed + .flow-node .node-circle,
.flow-nodes:has(.flow-node.passed) .flow-line { background: var(--fm-success); }

.flow-node.active .node-circle {
  background: var(--fm-brand-500);
  border-color: var(--fm-brand-500);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
  animation: pulse 2s ease-in-out infinite;
}
.flow-node.active .node-label { color: var(--fm-brand-600); font-weight: 700; }
.flow-node.active .node-sub { color: var(--fm-brand-500); opacity: 1; }

.flow-node.skipped .node-circle {
  background: var(--fm-bg-muted);
  border-color: var(--fm-border-soft);
  border-style: dashed;
  color: var(--fm-text-3);
  opacity: 0.5;
}
.flow-node.skipped .node-label { opacity: 0.5; text-decoration: line-through; }
.flow-node.skipped .node-sub { opacity: 0.4; }

.flow-node.rejected .node-circle {
  background: var(--fm-danger-soft);
  border-color: var(--fm-danger);
  color: var(--fm-danger);
  animation: shake 0.5s ease-in-out;
}
.flow-node.rejected .node-label { color: var(--fm-danger-ink); font-weight: 700; }

.flow-node.pending .node-circle {
  background: var(--fm-bg-muted);
  border-color: var(--fm-border-soft);
  color: var(--fm-text-3);
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); }
  50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.05); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}

.flow-branch {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
}
.flow-branch-rejected {
  background: rgba(239, 68, 68, 0.08);
  color: var(--fm-danger-ink);
  border: 1px solid rgba(239, 68, 68, 0.20);
}
.flow-branch-withdrawn {
  background: rgba(245, 158, 11, 0.08);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.20);
}
.flow-branch-finished {
  background: rgba(16, 185, 129, 0.10);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.25);
}
html.dark .flow-branch-finished { color: #34d399; }
html.dark .flow-branch-rejected { color: #f87171; }

.filter-meta { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); }
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

.node-text {
  color: var(--fm-text-3);
  font-size: 11px;
  line-height: 1.4;
  margin-top: 4px;
}

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
.action-btn:hover:not(:disabled) { color: var(--fm-brand-600); border-color: var(--fm-brand-300); background: rgba(99,102,241,0.04); }
.action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.action-btn.success:hover:not(:disabled) { color: var(--fm-success); border-color: rgba(16,185,129,0.4); background: var(--fm-success-soft); }
.action-btn.danger:hover:not(:disabled) { color: var(--fm-danger); border-color: rgba(239,68,68,0.4); background: var(--fm-danger-soft); }

.pager {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--fm-border-soft);
}

.items-wrap { width: 100%; }
.claim-form { margin-top: 14px; }
.rule-tip { margin-bottom: 12px; }
.rule-tip :deep(.el-alert__description) { font-size: 12px; line-height: 1.7; }
.add-item-btn { margin-top: var(--fm-space-2); }

.dialog-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.total-text { font-size: var(--fm-font-sm); color: var(--fm-text-2); }
.total-amount { color: var(--fm-danger); font-size: var(--fm-font-lg); font-variant-numeric: tabular-nums; font-weight: 700; }

.drawer-body { min-height: 240px; padding: 4px 0; }
.section-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--fm-text-3);
  margin: 20px 0 10px;
  text-transform: uppercase;
}
.flow-timeline { padding-left: 4px; font-size: 13px; color: var(--fm-text-1); }
.flow-timeline :deep(.el-timeline-item__timestamp) { font-size: 12px; }
.opinion { color: var(--fm-text-3); font-size: 12px; margin-top: 4px; white-space: pre-wrap; }
.reject-text { color: var(--fm-danger); }

@media (max-width: 1023px) {
  .detail-drawer { --el-drawer-size: 90%; width: 90% !important; }
}
</style>
