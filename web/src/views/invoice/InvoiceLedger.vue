<template>
  <div class="invoice-page">
    <PageHeader
      :icon="Tickets"
      icon-tone="violet"
      title="发票台账"
      sub="销项 / 进项发票登记 · 批量导入 · 年度增值税汇总"
    >
      <template #actions>
        <el-select v-model="vatYear" style="width: 120px" @change="loadVatSummary">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y}年`" />
        </el-select>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button :icon="Upload" @click="openImportDialog">批量导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openSaveDialog">登记发票</el-button>
      </template>
    </PageHeader>

    <!-- 增值税汇总卡 -->
    <div class="fm-stats-grid vat-grid">
      <StatCard
        :label="`销项税额(${vatYear}年)`"
        :value="fmtMoney(vat.salesTax)"
        :icon="TopRight"
        tone="success"
        :sub="`不含税销售额 ¥ ${fmtMoney(vat.salesAmount)}`"
      />
      <StatCard
        :label="`进项税额(${vatYear}年)`"
        :value="fmtMoney(vat.purchaseTax)"
        :icon="BottomLeft"
        tone="brand"
        :sub="`不含税采购额 ¥ ${fmtMoney(vat.purchaseAmount)}`"
      />
      <StatCard
        :label="`应纳增值税(${vatYear}年)`"
        :value="fmtMoney(vat.payableVat)"
        :icon="Coin"
        :tone="toNum(vat.payableVat) < 0 ? 'success' : 'danger'"
        sub="销项税额 − 进项税额"
      />
    </div>

    <SectionCard padless>
      <FilterBar>
        <el-radio-group v-model="queryIo" @change="onSearch">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button :value="1">销项</el-radio-button>
          <el-radio-button :value="2">进项</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="keyword"
          placeholder="发票号码 / 抬头"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <template #extra>
          <span class="filter-meta">
            <el-icon :size="13"><InfoFilled /></el-icon>
            共 {{ total }} 张发票 · 销项 {{ ioCount(1) }} · 进项 {{ ioCount(2) }}
          </span>
        </template>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="invoice-table">
        <el-table-column label="方向" width="90">
          <template #default="{ row }">
            <span class="io-pill" :class="row.io === 1 ? 'io-out' : 'io-in'">
              <el-icon :size="11">
                <TopRight v-if="row.io === 1" />
                <BottomLeft v-else />
              </el-icon>
              {{ row.io === 1 ? '销项' : '进项' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="发票号码" min-width="150">
          <template #default="{ row }">
            <span class="code-cell">{{ row.invoiceNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="对方单位" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="name-cell">{{ row.partner?.name || row.title || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="品名" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.itemName || '-' }}</template>
        </el-table-column>
        <el-table-column label="开票日期" width="120">
          <template #default="{ row }">
            <span class="num-mono">{{ fmtDate(row.date) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="不含税金额" width="135" align="right">
          <template #default="{ row }"><span class="num-cell">¥ {{ fmtMoney(row.amount) }}</span></template>
        </el-table-column>
        <el-table-column label="税率" width="80" align="right">
          <template #default="{ row }"><span class="num-cell">{{ (toNum(row.taxRate) * 100).toFixed(0) + '%' }}</span></template>
        </el-table-column>
        <el-table-column label="税额" width="125" align="right">
          <template #default="{ row }"><span class="num-cell text-brand">¥ {{ fmtMoney(row.taxAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="价税合计" width="140" align="right">
          <template #default="{ row }">
            <span class="num-cell text-bold">¥ {{ fmtMoney(row.total) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span v-if="INVOICE_STATUS[Number(row.status)]" class="status-pill" :class="`pill-${INVOICE_STATUS[Number(row.status)].tag}`">
              <span class="pill-dot" />
              {{ INVOICE_STATUS[Number(row.status)].label }}
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="right" fixed="right">
          <template #default="{ row }">
            <button v-if="row.io === 1 && !row.arapBillId" class="action-btn" @click="toReceivable(row)">生成应收单</button>
            <button class="action-btn danger" @click="removeInvoice(row)">删除</button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无发票记录" description="可通过右上角「登记发票」或「批量导入」录入">
            <template #action>
              <el-button type="primary" :icon="Plus" @click="openSaveDialog">登记发票</el-button>
            </template>
          </EmptyState>
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
    </SectionCard>

    <!-- 登记发票 -->
    <el-dialog v-model="saveVisible" title="登记发票" width="min(92vw, 640px)" destroy-on-close>
      <el-form ref="invFormRef" :model="invForm" :rules="invRules" label-width="100px">
        <el-form-item label="方向">
          <el-radio-group v-model="invForm.io">
            <el-radio :value="1">销项</el-radio>
            <el-radio :value="2">进项</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="发票号码" prop="invoiceNo">
          <el-input v-model.trim="invForm.invoiceNo" placeholder="请输入发票号码" maxlength="30" />
        </el-form-item>
        <el-form-item label="对方单位">
          <el-select v-model="invForm.partnerCode" filterable clearable placeholder="选择已建档单位(可清空)" style="width: 100%">
            <el-option v-for="p in partners" :key="p.id" :value="p.code" :label="`${p.code} ${p.name}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="抬头">
          <el-input v-model.trim="invForm.title" placeholder="无建档单位时手填发票抬头" maxlength="120" />
        </el-form-item>
        <el-form-item label="品名">
          <el-input v-model.trim="invForm.itemName" placeholder="货物或应税劳务名称" maxlength="120" />
        </el-form-item>
        <el-form-item label="开票日期" prop="date">
          <el-date-picker v-model="invForm.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="invForm.amount" :precision="2" :step="100" :min="0" style="width: 240px" />
        </el-form-item>
        <el-form-item label="税率">
          <el-select v-model="invForm.taxRate" style="width: 160px">
            <el-option v-for="r in TAX_RATES" :key="r" :value="r" :label="`${(r * 100).toFixed(0)}%`" />
          </el-select>
        </el-form-item>
        <el-form-item label=" ">
          <div class="calc-box">
            <span>税额:<b>¥ {{ fmtMoney(taxCalc.taxAmount) }}</b></span>
            <span>价税合计:<b>¥ {{ fmtMoney(taxCalc.total) }}</b></span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 -->
    <el-dialog v-model="importVisible" title="批量导入发票(CSV)" width="min(92vw, 720px)" destroy-on-close>
      <el-alert type="info" :closable="false" class="import-tip">
        <p>CSV 格式:方向,开票日期,发票号码,对方单位,品名,金额,税率</p>
        <p>首行为表头会被忽略;方向支持「销项 / 进项」或 1 / 2;税率支持 0.13 或 13%。</p>
      </el-alert>
      <el-input
        v-model="csvText"
        type="textarea"
        :rows="10"
        placeholder="方向,开票日期,发票号码,对方单位,品名,金额,税率&#10;销项,2024-07-01,24356000000123456,某某科技有限公司,信息技术服务费,10000,0.13&#10;进项,2024-07-05,04312000000654321,某某贸易有限公司,办公耗材,2000,13%"
      />
      <div v-if="importResult" class="import-result">
        <el-alert
          :type="toNum(importResult.failed) > 0 ? 'warning' : 'success'"
          :closable="false"
          :title="`导入成功 ${toNum(importResult.imported)} 条 / 失败 ${toNum(importResult.failed)} 条`"
        />
        <div v-for="(e, i) in importResult.errors || []" :key="i" class="err-line">{{ e }}</div>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button type="primary" :loading="importing" @click="submitImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import {
  Tickets, TopRight, BottomLeft, Coin, Plus, Search, Upload, InfoFilled, Download,
} from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import {
  invoiceList, invoiceSave, invoiceImportCsv, invoiceVatSummary,
  invoiceToReceivable, invoiceRemove, partnerList,
} from '@/api/modules'
import { fmtDate, fmtMoney, toNum, INVOICE_STATUS } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import StatCard from '@/components/StatCard.vue'

// ==================== 增值税汇总 ====================
const now = dayjs()
const vatYear = ref(now.year())
const yearOptions = ref<number[]>([now.year(), now.year() - 1, now.year() - 2])
const vat = reactive({ salesAmount: 0, salesTax: 0, purchaseAmount: 0, purchaseTax: 0, payableVat: 0 })

async function loadVatSummary() {
  try {
    const res: any = await invoiceVatSummary(vatYear.value)
    Object.assign(vat, res || {})
  } catch { /* 拦截器已提示 */ }
}

const queryIo = ref<'' | 1 | 2>('')
const keyword = ref('')
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
      url: '/invoices',
      filename: '发票台账',
      params: { io: queryIo.value === '' ? undefined : queryIo.value, keyword: keyword.value.trim() || undefined, page: undefined, pageSize: undefined },
      loadingText: '发票台账 Excel',
    })
  } finally {
    exporting.value = false
  }
}

function ioCount(io: number) { return list.value.filter((r) => r.io === io).length }

async function query() {
  loading.value = true
  try {
    const res: any = await invoiceList({
      page: page.value,
      pageSize: pageSize.value,
      io: queryIo.value === '' ? undefined : queryIo.value,
      keyword: keyword.value.trim() || undefined,
    })
    list.value = res?.list || []
    total.value = Number(res?.total) || 0
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function onSearch() { page.value = 1; query() }
function onSizeChange() { page.value = 1; query() }

async function removeInvoice(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除发票「${row.invoiceNo}」吗?删除后不可恢复。`, '删除发票', { type: 'warning' })
  } catch { return }
  try {
    await invoiceRemove(row.id)
    ElMessage.success('删除成功')
    query()
  } catch { /* 拦截器已提示 */ }
}

async function toReceivable(row: any) {
  try {
    const res: any = await invoiceToReceivable(row.id)
    ElMessage.success(res?.billNo ? `应收单已生成:${res.billNo}` : '应收单已生成')
    query()
  } catch { /* 拦截器已提示 */ }
}

// ==================== 登记发票 ====================
const saveVisible = ref(false)
const saving = ref(false)
const invFormRef = ref<FormInstance>()
const partners = ref<any[]>([])
const TAX_RATES = [0.13, 0.09, 0.06, 0.03, 0.01, 0]

const invForm = reactive({
  io: 1 as 1 | 2,
  invoiceNo: '',
  partnerCode: '',
  title: '',
  itemName: '',
  date: '',
  amount: undefined as number | undefined,
  taxRate: 0.13,
})

const invRules: FormRules = {
  invoiceNo: [{ required: true, message: '请输入发票号码', trigger: 'blur' }],
  date: [{ required: true, message: '请选择开票日期', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    { validator: (_r, v, cb) => (toNum(v) > 0 ? cb() : cb(new Error('金额必须大于0'))), trigger: 'blur' },
  ],
}

const taxCalc = computed(() => {
  const amount = toNum(invForm.amount)
  const rate = toNum(invForm.taxRate)
  const taxAmount = Math.round(amount * rate * 100) / 100
  return { taxAmount, total: Math.round((amount + taxAmount) * 100) / 100 }
})

function openSaveDialog() {
  Object.assign(invForm, { io: 1, invoiceNo: '', partnerCode: '', title: '', itemName: '', date: dayjs().format('YYYY-MM-DD'), amount: undefined, taxRate: 0.13 })
  saveVisible.value = true
  loadPartnerOptions()
}

async function loadPartnerOptions() {
  try {
    const res: any = await partnerList({ page: 1, pageSize: 500 })
    partners.value = res?.list || []
  } catch { /* 拦截器已提示 */ }
}

async function submitSave() {
  try { await invFormRef.value?.validate() } catch { return }
  saving.value = true
  try {
    await invoiceSave({
      io: invForm.io,
      invoiceNo: invForm.invoiceNo,
      partnerCode: invForm.partnerCode || '',
      title: invForm.title.trim(),
      itemName: invForm.itemName.trim(),
      date: invForm.date,
      amount: invForm.amount,
      taxRate: invForm.taxRate,
    })
    ElMessage.success('发票已保存')
    saveVisible.value = false
    query()
    loadVatSummary()
  } catch { /* 拦截器已提示 */ } finally { saving.value = false }
}

// ==================== 批量导入 ====================
const importVisible = ref(false)
const importing = ref(false)
const csvText = ref('')
const importResult = ref<any>(null)

function openImportDialog() { csvText.value = ''; importResult.value = null; importVisible.value = true }

async function submitImport() {
  if (!csvText.value.trim()) { ElMessage.warning('请粘贴 CSV 内容'); return }
  importing.value = true
  try {
    const res: any = await invoiceImportCsv(csvText.value)
    importResult.value = res || { imported: 0, failed: 0, errors: [] }
    ElMessage.success(`导入完成:成功 ${res?.imported || 0} 条`)
    query()
    loadVatSummary()
  } catch (e: any) {
    importResult.value = { imported: 0, failed: 0, errors: [e?.message || '导入失败'] }
  } finally { importing.value = false }
}

onMounted(() => {
  loadVatSummary()
  query()
})
</script>

<style scoped>
.invoice-page { display: flex; flex-direction: column; gap: 18px; }
.vat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 1023px) { .vat-grid { grid-template-columns: 1fr; } }

.filter-meta { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); }
.code-cell { font-family: var(--fm-font-mono); font-weight: 600; font-size: 12px; padding: 2px 8px; background: var(--fm-bg-muted); border-radius: var(--fm-radius-xs); }
.name-cell { font-weight: 500; }
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }
.text-brand { color: var(--fm-brand-600); }
.text-bold { font-weight: 700; }

.io-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
}
.io-out { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.io-in  { background: var(--fm-brand-50); color: var(--fm-brand-600); }
html.dark .io-in { background: rgba(99,102,241,0.15); color: var(--fm-brand-300); }

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
  margin: 0 2px;
}
.action-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); background: rgba(99,102,241,0.04); }
.action-btn.danger:hover { color: var(--fm-danger); border-color: rgba(239,68,68,0.4); background: var(--fm-danger-soft); }

.pager { padding: 14px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--fm-border-soft); }

.calc-box {
  display: flex;
  gap: 24px;
  padding: 10px 14px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-sm);
  font-size: 13px;
  color: var(--fm-text-2);
}
.calc-box b { color: var(--fm-brand-600); font-family: var(--fm-font-num); font-weight: 700; }

.import-tip { margin-bottom: 14px; }
.import-tip :deep(.el-alert__content) { line-height: 1.6; }
.import-result { margin-top: 14px; }
.err-line { margin-top: 6px; font-size: 12px; color: var(--fm-danger); }
</style>
