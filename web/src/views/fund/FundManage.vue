<template>
  <div class="fund-page">
    <PageHeader
      :icon="Wallet"
      icon-tone="info"
      title="资金管理"
      sub="资金账户 · 日记账 · 银行对账与余额调节表"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button type="primary" :icon="Plus" @click="openAccountDialog">新增账户</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <el-tabs v-model="activeTab" @tab-change="onTabChange" class="fund-tabs">
        <el-tab-pane name="journal">
          <template #label>
            <span class="tab-label"><el-icon :size="14"><Notebook /></el-icon>日记账</span>
          </template>
        </el-tab-pane>
        <el-tab-pane name="recon">
          <template #label>
            <span class="tab-label"><el-icon :size="14"><Connection /></el-icon>银行对账</span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <!-- ==================== 日记账 ==================== -->
      <template v-if="activeTab === 'journal'">
        <!-- 账户卡片 -->
        <div v-loading="accountsLoading" class="account-grid">
          <div
            v-for="acc in accounts"
            :key="acc.id"
            class="account-tile"
            :class="{ active: journalAccountId === acc.id }"
            @click="pickAccount(acc)"
          >
            <div class="acc-top">
              <div class="acc-icon"><el-icon :size="18"><CreditCard /></el-icon></div>
              <span v-if="acc.subject?.code" class="acc-code-tag">{{ acc.subject.code }}</span>
            </div>
            <div class="acc-name">{{ acc.name }}</div>
            <div class="acc-line">{{ acc.bankName || '-' }}</div>
            <div class="acc-line mono">{{ acc.accountNo || '-' }}</div>
          </div>
          <div class="account-tile add-tile" @click="openAccountDialog">
            <el-icon :size="20"><Plus /></el-icon>
            <span>新增账户</span>
          </div>
        </div>

        <FilterBar class="fund-filter">
          <el-select v-model="journalAccountId" placeholder="请选择账户" style="width: 200px">
            <el-option v-for="a in accounts" :key="a.id" :value="a.id" :label="a.name" />
          </el-select>
          <el-select v-model="journalYear" style="width: 120px">
            <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y}年`" />
          </el-select>
          <el-select v-model="journalMonth" style="width: 100px">
            <el-option v-for="m in 12" :key="m" :value="m" :label="`${m}月`" />
          </el-select>
          <el-input
            v-model="journalKeyword"
            placeholder="摘要 / 对方单位 / 票据号"
            clearable
            :prefix-icon="Search"
            style="width: 240px"
            @keyup.enter="onSearchJournal"
            @clear="onSearchJournal"
          />
          <el-button type="primary" :icon="Search" @click="onSearchJournal">查询</el-button>
        </FilterBar>

        <template v-if="journalAccountId">
          <el-table v-loading="loading" :data="list" class="fund-table">
            <el-table-column label="日期" width="120">
              <template #default="{ row }"><span class="num-mono">{{ fmtDate(row.date) }}</span></template>
            </el-table-column>
            <el-table-column label="凭证号" width="110">
              <template #default="{ row }">
                <span v-if="row.voucherWord && row.voucherNo" class="voucher-no-cell">{{ row.voucherWord }}-{{ row.voucherNo }}</span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="170" show-overflow-tooltip />
            <el-table-column label="科目" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.subjectCode" class="name-cell">{{ row.subjectCode }} {{ row.subjectName || '' }}</span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="partnerName" label="对方单位" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.partnerName || '-' }}</template>
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
            <el-table-column label="方向" width="90">
              <template #default="{ row }">
                <span class="dir-pill" :class="row.direction === '收' ? 'dir-in' : 'dir-out'">
                  <el-icon :size="11"><TopRight v-if="row.direction === '收'" /><BottomRight v-else /></el-icon>
                  {{ row.direction === '收' ? '收入' : '支出' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="金额" min-width="140" align="right">
              <template #default="{ row }">
                <span class="num-cell" :class="row.direction === '收' ? 'text-success' : 'text-danger'">
                  {{ row.direction === '收' ? '+' : '-' }} ¥ {{ fmtMoney(row.amount) }}
                </span>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="本期无流水" description="调整年月或选择其他账户查询" />
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
              @current-change="queryJournals"
              @size-change="onSizeChange"
            />
          </div>
        </template>
        <EmptyState v-else title="尚未选择资金账户" description="请在上方筛选中选择账户后查看日记账明细" />
      </template>

      <!-- ==================== 银行对账 ==================== -->
      <template v-else>
        <FilterBar class="fund-filter">
          <el-select v-model="reconAccountId" placeholder="请选择账户" style="width: 200px">
            <el-option v-for="a in accounts" :key="a.id" :value="a.id" :label="a.name" />
          </el-select>
          <el-select v-model="reconYear" style="width: 120px">
            <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y}年`" />
          </el-select>
          <el-select v-model="reconMonth" style="width: 100px">
            <el-option v-for="m in 12" :key="m" :value="m" :label="`${m}月`" />
          </el-select>
          <el-button type="primary" :icon="Search" :disabled="!reconAccountId" @click="loadReconciliation">查询</el-button>
          <el-button :icon="Upload" :disabled="!reconAccountId" @click="openImportDialog">导入对账单</el-button>
          <el-button type="warning" :icon="MagicStick" :disabled="!reconAccountId" @click="doAutoMatch">自动勾兑</el-button>
        </FilterBar>

        <div v-loading="reconLoading" class="recon-body">
          <template v-if="recon">
            <div class="recon-summary">
              <div class="summary-head">
                <el-icon :size="20"><Document /></el-icon>
                <span class="summary-title">
                  {{ recon.account?.name || '' }} · 银行存款余额调节表
                </span>
                <span class="summary-period">{{ recon.yearMonth || '' }}</span>
              </div>
              <div class="summary-grid">
                <div class="summary-item">
                  <span class="si-label">企业日记账余额</span>
                  <span class="si-num num-cell">¥ {{ fmtMoney(recon.bookBalance) }}</span>
                </div>
                <div class="summary-item">
                  <span class="si-label">调整后余额</span>
                  <span class="si-num num-cell text-brand">¥ {{ fmtMoney(recon.adjustedBalance) }}</span>
                </div>
                <div class="summary-item">
                  <span class="si-label">未勾对笔数</span>
                  <span class="si-num num-cell" :class="{ 'text-danger text-bold': toNum(recon.statement?.unmatchedCount) > 0 }">
                    {{ toNum(recon.statement?.unmatchedCount) }} 笔
                  </span>
                </div>
                <div class="summary-item">
                  <span class="si-label">对账单收入合计</span>
                  <span class="si-num num-cell">¥ {{ fmtMoney(recon.statement?.totalIn) }}</span>
                </div>
                <div class="summary-item">
                  <span class="si-label">对账单支出合计</span>
                  <span class="si-num num-cell">¥ {{ fmtMoney(recon.statement?.totalOut) }}</span>
                </div>
                <div class="summary-item">
                  <span class="si-label">对账单净变动</span>
                  <span class="si-num num-cell">¥ {{ fmtMoney(recon.statement?.netChange) }}</span>
                </div>
              </div>
            </div>

            <div class="section-title">未达账项</div>
            <el-table v-if="(recon.unmatchedLines || []).length > 0" :data="recon.unmatchedLines" class="unmatched-table">
              <el-table-column label="日期" width="120">
                <template #default="{ row }"><span class="num-mono">{{ fmtDate(row.date) }}</span></template>
              </el-table-column>
              <el-table-column label="金额" min-width="140" align="right">
                <template #default="{ row }">
                  <span class="num-cell" :class="{ 'text-danger': toNum(row.amount) < 0 }">¥ {{ fmtMoney(row.amount) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="摘要" min-width="240" show-overflow-tooltip>
                <template #default="{ row }">{{ row.memo || '-' }}</template>
              </el-table-column>
            </el-table>
            <EmptyState v-else title="本期无未达账项" description="日记账与对账单已全部勾对完成" />
          </template>
          <EmptyState v-else-if="!reconLoading" title="请先选择账户与年月" description="点击「查询」生成银行存款余额调节表" />
        </div>
      </template>
    </SectionCard>

    <!-- 新增账户 -->
    <el-dialog v-model="accountVisible" title="新增资金账户" width="min(92vw, 560px)" destroy-on-close>
      <el-form ref="accountFormRef" :model="accountForm" :rules="accountRules" label-width="100px">
        <el-form-item label="账户名称" prop="name">
          <el-input v-model.trim="accountForm.name" placeholder="如:工行基本户" maxlength="50" />
        </el-form-item>
        <el-form-item label="开户银行">
          <el-input v-model.trim="accountForm.bankName" placeholder="选填" maxlength="60" />
        </el-form-item>
        <el-form-item label="银行账号">
          <el-input v-model.trim="accountForm.accountNo" placeholder="选填" maxlength="40" />
        </el-form-item>
        <el-form-item label="对应科目" prop="subjectCode">
          <el-select v-model="accountForm.subjectCode" style="width: 100%">
            <el-option v-for="s in fundSubjects" :key="s.code" :value="s.code" :label="`${s.code} ${s.name}`" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountVisible = false">取消</el-button>
        <el-button type="primary" :loading="accountSaving" @click="submitAccount">保存</el-button>
      </template>
    </el-dialog>

    <!-- 导入对账单 -->
    <el-dialog v-model="importVisible" title="导入银行对账单(CSV)" width="min(92vw, 640px)" destroy-on-close>
      <el-alert type="info" :closable="false" class="import-tip">
        CSV 格式:日期,金额,摘要;收入为正、支出为负,首行表头忽略。
      </el-alert>
      <el-input v-model="statementCsv" type="textarea" :rows="8" :placeholder="STATEMENT_PLACEHOLDER" />
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="submitStatementImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import {
  fundAccounts, fundSaveAccount, fundJournals,
  fundStatementImport, fundAutoMatch, fundReconciliation, subjectTree,
} from '@/api/modules'
import { fmtDate, fmtMoney, toNum } from '@/utils/format'
import { exportExcel } from '@/utils/exporter'
import {
  Wallet, Plus, Notebook, Connection, CreditCard, Search, Upload, MagicStick,
  Document, TopRight, BottomRight, Download,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

interface BankAccount {
  id: number
  name: string
  bankName?: string
  accountNo?: string
  subject?: { code: string; name: string } | null
}

const activeTab = ref('journal')
const accounts = ref<BankAccount[]>([])
const accountsLoading = ref(false)

const now = dayjs()
const yearOptions = ref<number[]>([now.year(), now.year() - 1, now.year() - 2])

async function loadAccounts() {
  accountsLoading.value = true
  try {
    const res: any = await fundAccounts()
    accounts.value = Array.isArray(res) ? res : res?.list || []
  } catch { /* 拦截器已提示 */ } finally { accountsLoading.value = false }
}

function onTabChange(name: string | number) {
  if (String(name) === 'recon') loadReconciliation()
}

// ==================== 日记账 ====================
const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const journalAccountId = ref<number | null>(null)
const journalYear = ref(now.year())
const journalMonth = ref(now.month() + 1)
const journalKeyword = ref('')
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    const kw = journalKeyword.value.trim()
    await exportExcel({
      url: '/fund/accounts',
      filename: '资金账户',
      params: {
        accountId: journalAccountId.value ?? undefined,
        year: journalYear.value,
        month: journalMonth.value,
        keyword: kw || undefined,
        page: undefined,
        pageSize: undefined,
      },
      loadingText: '资金账户 Excel',
    })
  } finally {
    exporting.value = false
  }
}

async function queryJournals() {
  if (!journalAccountId.value) return
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      accountId: journalAccountId.value, year: journalYear.value, month: journalMonth.value,
      page: page.value, pageSize: pageSize.value,
    }
    const kw = journalKeyword.value.trim()
    if (kw) params.keyword = kw
    const res: any = await fundJournals(params)
    list.value = res?.list || []
    total.value = Number(res?.total) || 0
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function onSearchJournal() {
  if (!journalAccountId.value) { ElMessage.warning('请先选择资金账户'); return }
  page.value = 1
  queryJournals()
}

function onSizeChange() { page.value = 1; queryJournals() }

function pickAccount(acc: BankAccount) {
  if (journalAccountId.value === acc.id) return
  journalAccountId.value = acc.id
  page.value = 1
  queryJournals()
}

// ==================== 新增账户 ====================
const accountVisible = ref(false)
const accountSaving = ref(false)
const accountFormRef = ref<FormInstance>()
const fundSubjects = ref<any[]>([])

const accountForm = reactive({ name: '', bankName: '', accountNo: '', subjectCode: '100201' })

const accountRules: FormRules = {
  name: [{ required: true, message: '请输入账户名称', trigger: 'blur' }],
  subjectCode: [{ required: true, message: '请选择对应科目', trigger: 'change' }],
}

function openAccountDialog() {
  accountForm.name = ''
  accountForm.bankName = ''
  accountForm.accountNo = ''
  accountForm.subjectCode = '100201'
  accountVisible.value = true
  loadFundSubjects()
}

let fundSubjectsLoaded = false
async function loadFundSubjects() {
  if (fundSubjectsLoaded) return
  try {
    const res: any = await subjectTree()
    fundSubjects.value = (res?.list || []).filter((s: any) => s.isLeaf && String(s.code || '').startsWith('1002'))
    fundSubjectsLoaded = true
    if (!fundSubjects.value.some((s: any) => s.code === accountForm.subjectCode)) {
      accountForm.subjectCode = fundSubjects.value[0]?.code || '100201'
    }
  } catch { /* 拦截器已提示 */ }
}

async function submitAccount() {
  try { await accountFormRef.value?.validate() } catch { return }
  accountSaving.value = true
  try {
    await fundSaveAccount({
      name: accountForm.name,
      bankName: accountForm.bankName || undefined,
      accountNo: accountForm.accountNo || undefined,
      subjectCode: accountForm.subjectCode,
    })
    ElMessage.success('账户保存成功')
    accountVisible.value = false
    loadAccounts()
  } catch { /* 拦截器已提示 */ } finally { accountSaving.value = false }
}

// ==================== 银行对账 ====================
const reconLoading = ref(false)
const reconAccountId = ref<number | null>(null)
const reconYear = ref(now.year())
const reconMonth = ref(now.month() + 1)
const recon = ref<any>(null)

async function loadReconciliation() {
  if (!reconAccountId.value) { recon.value = null; return }
  reconLoading.value = true
  try {
    recon.value = await fundReconciliation(reconAccountId.value, reconYear.value, reconMonth.value)
  } catch { /* 拦截器已提示 */ } finally { reconLoading.value = false }
}

async function doAutoMatch() {
  if (!reconAccountId.value) return
  try {
    await ElMessageBox.confirm('自动勾兑将按日期与金额匹配日记账和对账单流水,是否继续?', '自动勾兑', { type: 'warning' })
  } catch { return }
  try {
    const res: any = await fundAutoMatch(reconAccountId.value)
    ElMessage.success(`勾兑成功 ${toNum(res?.matched)} 笔`)
    loadReconciliation()
  } catch { /* 拦截器已提示 */ }
}

const STATEMENT_PLACEHOLDER = '日期,金额,摘要\n2024-07-01,5000,收款\n2024-07-03,-1200,付款'

const importVisible = ref(false)
const importing = ref(false)
const statementCsv = ref('')

function openImportDialog() { statementCsv.value = ''; importVisible.value = true }

async function submitStatementImport() {
  if (!statementCsv.value.trim()) { ElMessage.warning('请先粘贴对账单 CSV 内容'); return }
  importing.value = true
  try {
    const res: any = await fundStatementImport(reconAccountId.value as number, statementCsv.value)
    ElMessage.success(`对账单导入成功 ${toNum(res?.imported)} 条`)
    importVisible.value = false
    loadReconciliation()
  } catch { /* 拦截器已提示 */ } finally { importing.value = false }
}

onMounted(async () => {
  await loadAccounts()
  if (accounts.value.length) {
    journalAccountId.value = accounts.value[0].id
    reconAccountId.value = accounts.value[0].id
  }
  queryJournals()
})
</script>

<style scoped>
.fund-page { display: flex; flex-direction: column; gap: 18px; }
.fund-tabs { padding: 0 24px; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }

.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 16px 24px;
}
.account-tile {
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  border-radius: var(--fm-radius-md);
  box-shadow: var(--fm-shadow-xs);
  padding: 16px 18px;
  cursor: pointer;
  transition: all var(--fm-dur-base) var(--fm-ease);
  position: relative;
  overflow: hidden;
}
.account-tile::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--fm-gradient-hero);
  opacity: 0;
  transition: opacity var(--fm-dur-base) var(--fm-ease);
}
.account-tile:hover { transform: translateY(-2px); box-shadow: var(--fm-shadow-card-hover); }
.account-tile:hover::before { opacity: 1; }
.account-tile.active {
  border-color: var(--fm-brand-300);
  box-shadow: 0 0 0 1px var(--fm-brand-300) inset, var(--fm-shadow-md);
  background: var(--fm-gradient-brand-soft);
}
.account-tile.active::before { opacity: 1; }
.acc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.acc-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--fm-radius-sm);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.account-tile.active .acc-icon { background: var(--fm-gradient-hero); color: #fff; }
.acc-code-tag {
  font-family: var(--fm-font-mono);
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
}
.account-tile.active .acc-code-tag { background: var(--fm-brand-50); color: var(--fm-brand-600); }
html.dark .account-tile.active .acc-code-tag { background: rgba(99,102,241,0.2); color: var(--fm-brand-300); }
.acc-name { font-weight: 600; font-size: 14px; color: var(--fm-text-1); margin-bottom: 4px; }
.acc-line { color: var(--fm-text-3); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acc-line.mono { font-family: var(--fm-font-mono); font-size: 11px; }

.add-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 110px;
  border-style: dashed;
  border-color: var(--fm-border);
  color: var(--fm-brand-600);
  background: transparent;
  box-shadow: none;
  font-size: 12px;
  font-weight: 500;
}
.add-tile:hover { border-color: var(--fm-brand-300); background: var(--fm-brand-50); }

.fund-filter { background: transparent; border: none; padding: 0 24px 16px; }
html.dark .fund-filter { background: transparent; }

.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }
.name-cell { font-weight: 500; }
.text-success { color: var(--fm-success); }
.text-danger { color: var(--fm-danger); }
.text-bold { font-weight: 700; }
.text-brand { color: var(--fm-brand-600); }

.voucher-no-cell {
  font-family: var(--fm-font-num);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
}
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

.dir-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
}
.dir-in { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.dir-out { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }

.pager { padding: 14px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--fm-border-soft); }

/* 余额调节表 */
.recon-body { padding: 0 24px 24px; }
.recon-summary {
  background: var(--fm-gradient-brand-soft);
  border: 1px solid rgba(99,102,241,0.2);
  border-radius: var(--fm-radius-md);
  padding: 18px 20px;
  margin-bottom: 18px;
}
.summary-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  color: var(--fm-brand-600);
}
html.dark .summary-head { color: var(--fm-brand-300); }
.summary-title { font-size: 15px; font-weight: 600; color: var(--fm-text-1); }
.summary-period {
  margin-left: auto;
  font-size: 12px;
  color: var(--fm-text-3);
  font-family: var(--fm-font-num);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 767px) { .summary-grid { grid-template-columns: 1fr 1fr; } }
.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: var(--fm-bg-elevated);
  border-radius: var(--fm-radius-sm);
  border: 1px solid var(--fm-border-soft);
}
.si-label { font-size: 11px; color: var(--fm-text-3); font-weight: 500; }
.si-num { font-size: 18px; font-weight: 700; color: var(--fm-text-1); font-family: var(--fm-font-num); }

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fm-text-1);
  margin: 18px 0 10px;
}

.import-tip { margin-bottom: 14px; }
</style>
