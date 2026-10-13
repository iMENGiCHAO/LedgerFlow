<template>
  <div class="arap-page">
    <PageHeader
      :icon="Coin"
      icon-tone="warning"
      title="应收应付"
      sub="单据登记 · 多对多核销 · 账龄分析"
    >
      <template #actions v-if="activeTab !== 'aging'">
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button :icon="Connection" @click="openWriteoffDialog">单据核销</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新增单据</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <el-tabs v-model="activeTab" @tab-change="onTabChange" class="arap-tabs">
        <el-tab-pane label="应收单" name="1" />
        <el-tab-pane label="收款单" name="2" />
        <el-tab-pane label="应付单" name="3" />
        <el-tab-pane label="付款单" name="4" />
        <el-tab-pane name="aging">
          <template #label>
            <span class="tab-label">
              <el-icon :size="14"><DataLine /></el-icon>
              账龄分析
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- ==================== 单据列表 ==================== -->
      <template v-if="activeTab !== 'aging'">
        <div class="arap-stats">
          <div class="stat">
            <span class="stat-label">单据数</span>
            <span class="stat-num num-cell">{{ total }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">金额合计</span>
            <span class="stat-num num-cell text-brand">¥ {{ totalAmountFmt }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">未核销余额</span>
            <span class="stat-num num-cell text-danger">¥ {{ totalOutstandingFmt }}</span>
          </div>
        </div>

        <el-table v-loading="loading" :data="list" class="arap-table">
          <el-table-column label="单据号" min-width="150">
            <template #default="{ row }">
              <span class="bill-no">{{ row.billNo }}</span>
              <el-tag v-if="isReceivablePayable && toNum(row.outstanding) > 0 && row.dueDate && new Date(row.dueDate) < new Date()" size="small" type="danger" effect="plain" class="overdue-tag">已逾期</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="往来单位" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="partner-cell">
                <span class="partner-dot" :class="isReceivablePayable ? 'is-receivable' : 'is-payable'" />
                {{ row.partner?.name || '-' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="日期" width="110">
            <template #default="{ row }">{{ fmtDate(row.date) }}</template>
          </el-table-column>
          <el-table-column label="到期日" width="110">
            <template #default="{ row }">
              <span :class="isReceivablePayable ? 'num-cell' : 'muted'">{{ isReceivablePayable ? fmtDate(row.dueDate) : '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="130" align="right">
            <template #default="{ row }"><span class="num-cell">¥ {{ fmtMoney(row.amount) }}</span></template>
          </el-table-column>
          <el-table-column label="已核销" width="120" align="right">
            <template #default="{ row }"><span class="num-cell muted">¥ {{ fmtMoney(row.writtenOff) }}</span></template>
          </el-table-column>
          <el-table-column label="未核销" width="120" align="right">
            <template #default="{ row }">
              <span class="num-cell" :class="{ 'text-danger': toNum(row.outstanding) > 0 }">¥ {{ fmtMoney(row.outstanding) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="结算方式" width="110">
            <template #default="{ row }">
              <span v-if="row.settleType" class="settle-pill">{{ row.settleType }}</span>
              <span v-else class="muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="票据号" width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="row.settleNo ? 'num-mono' : 'muted'">{{ row.settleNo || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="凭证" min-width="180">
            <template #default="{ row }">
              <template v-if="row.voucher">
                <span class="voucher-no-cell">{{ row.voucher.word }}-{{ row.voucher.no }}</span>
                <span class="status-pill" :class="`pill-${voucherTag(row.voucher.status)}`">
                  <span class="pill-dot" />
                  {{ voucherLabel(row.voucher.status) }}
                </span>
              </template>
              <span v-else class="muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="memo" label="备注" min-width="140" show-overflow-tooltip />
          <el-table-column label="操作" width="90" align="right" fixed="right">
            <template #default="{ row }">
              <button
                v-if="!row.voucher && toNum(row.writtenOff) === 0"
                class="action-btn danger"
                @click="removeBill(row)"
              >删除</button>
              <span v-else class="muted">-</span>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              :title="`暂无${ARAP_TYPE_NAMES[currentBillType] || '单据'}数据`"
              :description="`点击右上角「新增单据」登记${ARAP_TYPE_NAMES[currentBillType] || ''}`"
            />
          </template>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            layout="total, sizes, prev, pager, next, jumper"
            background
            :page-sizes="[10, 20, 50, 100]"
            @current-change="query"
            @size-change="onSizeChange"
          />
        </div>
      </template>

      <!-- ==================== 账龄分析 ==================== -->
      <template v-else>
        <div class="aging-toolbar">
          <el-radio-group v-model="agingType" @change="loadAging">
            <el-radio-button :value="1">应收账款</el-radio-button>
            <el-radio-button :value="3">应付账款</el-radio-button>
          </el-radio-group>
        </div>

        <el-table v-loading="agingLoading" :data="agingList" show-summary :summary-method="agingSummary" class="aging-table">
          <el-table-column prop="partnerName" label="往来单位" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="partner-cell">
                <span class="partner-dot" :class="agingType === 1 ? 'is-receivable' : 'is-payable'" />
                {{ row.partnerName }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="0-30 天" min-width="120" align="right">
            <template #default="{ row }">
              <div class="age-bar" :style="{ '--p': `${bucketPct(row.b0_30, row.total)}%`, '--c': 'var(--fm-success)' }">
                <span class="num-cell">¥ {{ fmtMoney(row.b0_30) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="31-60 天" min-width="120" align="right">
            <template #default="{ row }">
              <div class="age-bar" :style="{ '--p': `${bucketPct(row.b31_60, row.total)}%`, '--c': 'var(--fm-info)' }">
                <span class="num-cell">¥ {{ fmtMoney(row.b31_60) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="61-90 天" min-width="120" align="right">
            <template #default="{ row }">
              <div class="age-bar" :style="{ '--p': `${bucketPct(row.b61_90, row.total)}%`, '--c': 'var(--fm-warning)' }">
                <span class="num-cell">¥ {{ fmtMoney(row.b61_90) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="90 天以上" min-width="130" align="right">
            <template #default="{ row }">
              <div class="age-bar" :style="{ '--p': `${bucketPct(row.b90p, row.total)}%`, '--c': 'var(--fm-danger)' }">
                <span class="num-cell">¥ {{ fmtMoney(row.b90p) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="合计" min-width="140" align="right">
            <template #default="{ row }"><span class="num-cell text-brand">¥ {{ fmtMoney(row.total) }}</span></template>
          </el-table-column>
          <el-table-column label="其中逾期" min-width="140" align="right">
            <template #default="{ row }">
              <span class="num-cell" :class="{ 'text-danger text-bold': toNum(row.overdueTotal) > 0 }">
                ¥ {{ fmtMoney(row.overdueTotal) }}
              </span>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState
              :title="agingType === 1 ? '暂无应收账款账龄数据' : '暂无应付账款账龄数据'"
              description="单据登记并记账后,这里会自动按账龄归集"
            />
          </template>
        </el-table>
      </template>
    </SectionCard>

    <!-- 新增单据 -->
    <el-dialog v-model="createVisible" :title="`新增${ARAP_TYPE_NAMES[currentBillType] || '单据'}`" width="min(92vw, 640px)" destroy-on-close>
      <el-form ref="billFormRef" :model="billForm" :rules="billRules" label-width="100px">
        <el-form-item label="往来单位" prop="partnerCode">
          <el-select v-model="billForm.partnerCode" filterable placeholder="请选择往来单位" style="width: 100%">
            <el-option v-for="p in partners" :key="p.id" :value="p.code" :label="`${p.code} ${p.name}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="单据日期" prop="date">
          <el-date-picker v-model="billForm.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="isReceivablePayable" label="到期日">
          <el-date-picker v-model="billForm.dueDate" type="date" value-format="YYYY-MM-DD" placeholder="选填" style="width: 100%" />
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="billForm.amount" :precision="2" :step="100" :min="0" style="width: 240px" />
        </el-form-item>
        <template v-if="isSettleTab">
          <el-divider content-position="left">结算信息</el-divider>
          <el-form-item label="结算方式">
            <el-select v-model="billForm.settleType" clearable placeholder="请选择结算方式" style="width: 100%">
              <el-option v-for="s in SETTLE_TYPES" :key="s" :value="s" :label="s" />
            </el-select>
          </el-form-item>
          <el-form-item label="票据号">
            <el-input v-model="billForm.settleNo" placeholder="支票号 / 交易流水号等" clearable />
          </el-form-item>
          <el-form-item label="资金科目">
            <el-select v-model="billForm.settleSubjectCode" style="width: 100%">
              <el-option v-for="s in fundSubjects" :key="s.code" :value="s.code" :label="`${s.code} ${s.name}`" />
            </el-select>
          </el-form-item>
          <el-form-item label="生成凭证">
            <el-switch v-model="billForm.generateVoucher" />
            <span class="form-tip">保存后自动生成记账凭证</span>
          </el-form-item>
        </template>
        <el-form-item label="备注">
          <el-input v-model="billForm.memo" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 核销 -->
    <el-dialog v-model="woVisible" title="单据核销" width="min(92vw, 600px)" destroy-on-close>
      <el-form label-width="110px" v-loading="woLoading">
        <el-form-item label="应收/应付单" required>
          <el-select v-model="woForm.openBillId" filterable clearable placeholder="选择未核销完毕的应收/应付单" style="width: 100%">
            <el-option v-for="o in woOpenOptions" :key="o.id" :value="o.id" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="收/付款单" required>
          <el-select v-model="woForm.settleBillId" filterable clearable placeholder="选择未核销完毕的收/付款单" style="width: 100%">
            <el-option v-for="o in woSettleOptions" :key="o.id" :value="o.id" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="本次核销金额" required>
          <el-input-number
            v-model="woForm.amount"
            :precision="2"
            :step="100"
            :min="0"
            :max="Number.isFinite(woMaxAmount) ? woMaxAmount : undefined"
            style="width: 240px"
          />
          <div class="form-tip block-tip">
            最大可核销金额: <span class="text-brand num-cell">¥ {{ Number.isFinite(woMaxAmount) ? fmtMoney(woMaxAmount) : '请先选择单据' }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="woVisible = false">取消</el-button>
        <el-button type="primary" :loading="woSubmitting" @click="submitWriteoff">确认核销</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import {
  Plus, Connection, Coin, DataLine, Download,
} from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import {
  arapBills, arapCreateBill, arapRemoveBill, arapWriteoff, arapAging,
  partnerList, subjectTree,
} from '@/api/modules'
import {
  fmtDate, fmtMoney, toNum, ARAP_TYPE_NAMES, SETTLE_TYPES, VOUCHER_STATUS,
} from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const activeTab = ref('1')
const currentBillType = computed(() => Number(activeTab.value))
const isReceivablePayable = computed(() => currentBillType.value === 1 || currentBillType.value === 3)
const isSettleTab = computed(() => currentBillType.value === 2 || currentBillType.value === 4)

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/arap/bills',
      filename: '应收应付',
      params: { type: currentBillType.value, page: undefined, pageSize: undefined },
      loadingText: '应收应付 Excel',
    })
  } finally {
    exporting.value = false
  }
}

const totalAmountFmt = computed(() => fmtMoney(list.value.reduce((a, r) => a + toNum(r.amount), 0)))
const totalOutstandingFmt = computed(() => fmtMoney(list.value.reduce((a, r) => a + toNum(r.outstanding), 0)))

async function query() {
  if (activeTab.value === 'aging') return
  loading.value = true
  try {
    const res: any = await arapBills({ type: currentBillType.value, page: page.value, pageSize: pageSize.value })
    list.value = res?.list || []
    total.value = Number(res?.total) || 0
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function onSizeChange() { page.value = 1; query() }
function onTabChange(name: string | number) {
  if (String(name) === 'aging') { loadAging(); return }
  page.value = 1
  query()
}

async function removeBill(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除单据「${row.billNo}」吗?删除后不可恢复。`, '删除单据', { type: 'warning' })
  } catch { return }
  try {
    await arapRemoveBill(row.id)
    ElMessage.success('删除成功')
    query()
  } catch { /* 拦截器已提示 */ }
}

function voucherTag(status: unknown): string { return VOUCHER_STATUS[Number(status)]?.tag || 'info' }
function voucherLabel(status: unknown): string { return VOUCHER_STATUS[Number(status)]?.label || '未知' }

// ==================== 新增单据 ====================
const createVisible = ref(false)
const saving = ref(false)
const billFormRef = ref<FormInstance>()
const partners = ref<any[]>([])
const fundSubjects = ref<any[]>([])

const billForm = reactive({
  partnerCode: '',
  date: '',
  dueDate: '',
  amount: undefined as number | undefined,
  memo: '',
  settleType: '',
  settleNo: '',
  settleSubjectCode: '100201',
  generateVoucher: true,
})

const billRules: FormRules = {
  partnerCode: [{ required: true, message: '请选择往来单位', trigger: 'change' }],
  date: [{ required: true, message: '请选择单据日期', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    { validator: (_r: unknown, v: number, cb: (e?: Error) => void) => (toNum(v) > 0 ? cb() : cb(new Error('金额必须大于0'))), trigger: 'blur' },
  ],
}

function openCreateDialog() {
  Object.assign(billForm, {
    partnerCode: '',
    date: dayjs().format('YYYY-MM-DD'),
    dueDate: '',
    amount: undefined,
    memo: '',
    settleType: '',
    settleNo: '',
    settleSubjectCode: '100201',
    generateVoucher: true,
  })
  createVisible.value = true
  loadPartnerOptions()
  if (isSettleTab.value) loadFundSubjects()
}

async function loadPartnerOptions() {
  const pType = currentBillType.value === 1 || currentBillType.value === 2 ? 1 : 2
  try {
    const res: any = await partnerList({ page: 1, pageSize: 500, type: pType })
    partners.value = res?.list || []
  } catch { /* 拦截器已提示 */ }
}

let fundSubjectsLoaded = false
async function loadFundSubjects() {
  if (fundSubjectsLoaded) return
  try {
    const res: any = await subjectTree()
    fundSubjects.value = (res?.list || []).filter((s: any) => s.isLeaf && String(s.code || '').startsWith('1002'))
    fundSubjectsLoaded = true
    if (!fundSubjects.value.some((s: any) => s.code === billForm.settleSubjectCode)) {
      billForm.settleSubjectCode = fundSubjects.value[0]?.code || '100201'
    }
  } catch { /* 拦截器已提示 */ }
}

async function submitCreate() {
  try { await billFormRef.value?.validate() } catch { return }
  saving.value = true
  try {
    const t = currentBillType.value
    const payload: Record<string, unknown> = {
      type: t,
      partnerCode: billForm.partnerCode,
      date: billForm.date,
      amount: billForm.amount,
      memo: billForm.memo.trim(),
    }
    if (isReceivablePayable.value) payload.dueDate = billForm.dueDate || ''
    if (isSettleTab.value) {
      payload.settleType = billForm.settleType
      payload.settleNo = billForm.settleNo.trim()
      payload.settleSubjectCode = billForm.settleSubjectCode
      payload.generateVoucher = billForm.generateVoucher
    }
    await arapCreateBill(payload)
    ElMessage.success(`${ARAP_TYPE_NAMES[t] || '单据'}保存成功`)
    createVisible.value = false
    query()
  } catch { /* 拦截器已提示 */ } finally { saving.value = false }
}

// ==================== 核销 ====================
const woVisible = ref(false)
const woLoading = ref(false)
const woSubmitting = ref(false)
const woOpenOptions = ref<any[]>([])
const woSettleOptions = ref<any[]>([])
const woOutstandingMap = ref<Record<string, number>>({})
const woForm = reactive({ openBillId: undefined as number | undefined, settleBillId: undefined as number | undefined, amount: undefined as number | undefined })

const woMaxAmount = computed<number>(() => {
  const a = woForm.openBillId != null ? woOutstandingMap.value[String(woForm.openBillId)] : undefined
  const b = woForm.settleBillId != null ? woOutstandingMap.value[String(woForm.settleBillId)] : undefined
  const vals = [a, b].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return vals.length ? Math.min(...vals) : Infinity
})

function toOption(bill: any, prefix: string) {
  return {
    id: bill.id,
    outstanding: toNum(bill.outstanding),
    label: `[${prefix}] ${bill.billNo} ${bill.partner?.name || ''} 未核销 ¥ ${fmtMoney(bill.outstanding)}`,
  }
}

async function openWriteoffDialog() {
  Object.assign(woForm, { openBillId: undefined, settleBillId: undefined, amount: undefined })
  woOpenOptions.value = []
  woSettleOptions.value = []
  woOutstandingMap.value = {}
  woVisible.value = true
  woLoading.value = true
  try {
    const [r1, r3, r2, r4]: any[] = await Promise.all([
      arapBills({ type: 1, page: 1, pageSize: 200 }),
      arapBills({ type: 3, page: 1, pageSize: 200 }),
      arapBills({ type: 2, page: 1, pageSize: 200 }),
      arapBills({ type: 4, page: 1, pageSize: 200 }),
    ])
    const opens = [
      ...((r1?.list || []) as any[]).map((b) => toOption(b, '应收')),
      ...((r3?.list || []) as any[]).map((b) => toOption(b, '应付')),
    ]
    const settles = [
      ...((r2?.list || []) as any[]).map((b) => toOption(b, '收款')),
      ...((r4?.list || []) as any[]).map((b) => toOption(b, '付款')),
    ]
    woOpenOptions.value = opens.filter((o) => o.outstanding > 0)
    woSettleOptions.value = settles.filter((o) => o.outstanding > 0)
    for (const o of [...opens, ...settles]) woOutstandingMap.value[String(o.id)] = o.outstanding
  } catch { /* 拦截器已提示 */ } finally { woLoading.value = false }
}

async function submitWriteoff() {
  if (!woForm.openBillId) { ElMessage.warning('请选择应收/应付单'); return }
  if (!woForm.settleBillId) { ElMessage.warning('请选择收/付款单'); return }
  if (!woForm.amount || toNum(woForm.amount) <= 0) { ElMessage.warning('请输入大于0的核销金额'); return }
  woSubmitting.value = true
  try {
    await arapWriteoff({ openBillId: woForm.openBillId, settleBillId: woForm.settleBillId, amount: woForm.amount })
    ElMessage.success('核销成功')
    woVisible.value = false
    query()
  } catch { /* 拦截器已提示 */ } finally { woSubmitting.value = false }
}

// ==================== 账龄分析 ====================
const agingType = ref<1 | 3>(1)
const agingLoading = ref(false)
const agingList = ref<any[]>([])
const AGING_KEYS = ['b0_30', 'b31_60', 'b61_90', 'b90p', 'total', 'overdueTotal']

async function loadAging() {
  agingLoading.value = true
  try {
    const res: any = await arapAging(agingType.value)
    agingList.value = res?.list || []
  } catch { /* 拦截器已提示 */ } finally { agingLoading.value = false }
}

function bucketPct(v: any, total: any): number {
  const t = toNum(total)
  if (t <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((toNum(v) / t) * 100)))
}

function agingSummary(param: any): string[] {
  const sums: string[] = []
  ;(param.columns || []).forEach((col: any, i: number) => {
    if (i === 0) { sums[i] = '合计'; return }
    const key = AGING_KEYS[i - 1]
    sums[i] = key
      ? `¥ ${fmtMoney(agingList.value.reduce((acc, r) => acc + toNum(r[key]), 0))}`
      : ''
  })
  return sums
}

onMounted(query)
</script>

<style scoped>
.arap-page { display: flex; flex-direction: column; gap: 18px; }
.arap-tabs { padding: 0 24px; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }

.arap-stats {
  display: flex;
  gap: 0;
  padding: 14px 24px;
  background: var(--fm-bg-muted);
  border-bottom: 1px solid var(--fm-border-soft);
}
.arap-stats .stat { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 0 12px; }
.arap-stats .stat + .stat { border-left: 1px solid var(--fm-border-soft); }
.arap-stats .stat-label { font-size: 12px; color: var(--fm-text-3); font-weight: 500; }
.arap-stats .stat-num { font-size: 18px; font-weight: 700; color: var(--fm-text-1); font-family: var(--fm-font-num); }
.text-brand { color: var(--fm-brand-600); }
.text-danger { color: var(--fm-danger); }
.text-bold { font-weight: 700; }

.bill-no {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  display: inline-block;
}
.overdue-tag { margin-left: 6px; vertical-align: middle; }

.partner-cell { display: inline-flex; align-items: center; gap: 6px; }
.partner-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fm-text-3);
}
.partner-dot.is-receivable { background: var(--fm-warning); }
.partner-dot.is-payable { background: var(--fm-brand-500); }

.settle-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-xs);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  border: 1px solid var(--fm-border-soft);
}

.voucher-no-cell {
  font-family: var(--fm-font-num);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  margin-right: 6px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  white-space: nowrap;
}
.pill-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.status-pill.pill-success { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.status-pill.pill-warning { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
.status-pill.pill-danger { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }
.status-pill.pill-info { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }

.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }

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
.action-btn.danger:hover { color: var(--fm-danger); border-color: rgba(239,68,68,0.4); background: var(--fm-danger-soft); }

.pager { padding: 14px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--fm-border-soft); }

/* 账龄条形 */
.aging-toolbar { padding: 16px 24px; }
.age-bar {
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: 22px;
  padding-right: 8px;
  border-radius: var(--fm-radius-xs);
  overflow: hidden;
}
.age-bar::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--p, 0%);
  background: linear-gradient(90deg, color-mix(in oklab, var(--c, var(--fm-brand-500)) 18%, transparent), color-mix(in oklab, var(--c, var(--fm-brand-500)) 6%, transparent));
  transition: width var(--fm-dur-slow) var(--fm-ease);
}
.age-bar .num-cell { position: relative; z-index: 1; font-size: 12px; }

.aging-table :deep(.el-table__footer td.el-table__cell) { font-weight: 700; color: var(--fm-text-1); }

.form-tip { margin-left: 8px; color: var(--fm-text-3); font-size: 12px; }
.block-tip { display: block; margin-left: 0; line-height: 22px; margin-top: 4px; }
</style>
