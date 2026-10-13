<template>
  <div class="asset-page">
    <PageHeader
      :icon="Box"
      icon-tone="violet"
      title="固定资产"
      sub="资产卡片 · 月度折旧 · 出售/报废处置全流程"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增资产</el-button>
      </template>
    </PageHeader>

    <div class="overview-strip">
      <div class="ov-item">
        <span class="ov-label">资产数量</span>
        <span class="ov-num num-cell">{{ list.length }}</span>
        <span class="ov-suffix">台(项)</span>
      </div>
      <div class="ov-item">
        <span class="ov-label">原值合计</span>
        <span class="ov-num num-cell">¥ {{ originalValueTotalFmt }}</span>
      </div>
      <div class="ov-item">
        <span class="ov-label">累计折旧</span>
        <span class="ov-num num-cell text-warning">¥ {{ accumulatedTotalFmt }}</span>
      </div>
      <div class="ov-item">
        <span class="ov-label">净值合计</span>
        <span class="ov-num num-cell text-brand">¥ {{ netValueTotalFmt }}</span>
      </div>
    </div>

    <SectionCard padless>
      <FilterBar>
        <el-input
          v-model="query.keyword"
          placeholder="卡片号 / 资产名称"
          clearable
          :prefix-icon="Search"
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 140px">
          <el-option v-for="(v, k) in ASSET_STATUS" :key="k" :label="v.label" :value="Number(k)" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="asset-table">
        <el-table-column label="卡片号" width="140">
          <template #default="{ row }">
            <span class="code-cell">{{ row.cardNo }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="资产名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="name-cell">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类别" width="110">
          <template #default="{ row }">
            <span v-if="row.category" class="cat-pill">{{ row.category }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="取得日期" width="120">
          <template #default="{ row }"><span class="num-mono">{{ fmtDate(row.acquiredDate) }}</span></template>
        </el-table-column>
        <el-table-column label="原值" width="125" align="right">
          <template #default="{ row }"><span class="num-cell">¥ {{ fmtMoney(row.originalValue) }}</span></template>
        </el-table-column>
        <el-table-column label="残值率" width="90" align="right">
          <template #default="{ row }"><span class="num-cell">{{ fmtRate(row.salvageRate) }}</span></template>
        </el-table-column>
        <el-table-column label="年限" width="90">
          <template #default="{ row }">
            <span class="num-cell">{{ row.lifeMonths != null ? `${row.lifeMonths} 月` : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="月折旧" width="120" align="right">
          <template #default="{ row }"><span class="num-cell text-warning">¥ {{ fmtMoney(row.monthlyDepreciation) }}</span></template>
        </el-table-column>
        <el-table-column label="累计折旧" width="130" align="right">
          <template #default="{ row }"><span class="num-cell text-warning">¥ {{ fmtMoney(row.accumulatedDepreciation) }}</span></template>
        </el-table-column>
        <el-table-column label="净值" width="130" align="right">
          <template #default="{ row }">
            <span class="num-cell text-brand text-bold">¥ {{ fmtMoney(row.netValue) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="使用部门" width="120">
          <template #default="{ row }">
            <span v-if="row.useDept?.name" class="dept-pill">{{ row.useDept.name }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-pill" :class="`pill-${ASSET_STATUS[row.status]?.tag || 'info'}`">
              <span class="pill-dot" />
              {{ ASSET_STATUS[row.status]?.label || row.status }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="标记" width="90">
          <template #default="{ row }">
            <span v-if="row.fullyDepreciated" class="status-pill pill-info">
              <span class="pill-dot" />已提足
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right" fixed="right">
          <template #default="{ row }">
            <button v-if="row.status === 1" class="action-btn warn" @click="openDispose(row)">处置</button>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无资产卡片" description="点击右上角『新增资产』登记第一项资产" />
        </template>
      </el-table>
    </SectionCard>

    <!-- 新增资产 -->
    <el-dialog v-model="createVisible" title="新增固定资产" width="min(92vw, 640px)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="资产名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入资产名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="类别" prop="category">
          <el-select v-model="form.category" placeholder="请选择资产类别" style="width: 100%">
            <el-option v-for="c in ASSET_CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="取得日期" prop="acquiredDate">
          <el-date-picker v-model="form.acquiredDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="原值(元)" prop="originalValue">
          <el-input-number v-model="form.originalValue" :precision="2" :step="100" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="残值率(%)" prop="salvageRate">
          <el-input-number v-model="form.salvageRate" :min="0" :max="100" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="折旧年限" prop="lifeMonths">
          <el-input-number v-model="form.lifeMonths" :precision="0" :min="1" :step="12" placeholder="折旧月数,如 60" style="width: 100%" />
        </el-form-item>
        <el-form-item label="使用部门">
          <el-select v-model="form.useDeptId" placeholder="可不选" clearable style="width: 100%">
            <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="存放地点">
          <el-input v-model="form.location" placeholder="选填,如:3 号楼 201 室" maxlength="100" />
        </el-form-item>
        <el-form-item label="入库凭证">
          <el-switch v-model="form.generateVoucher" active-text="生成入库凭证" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 资产处置 -->
    <el-dialog v-model="disposeVisible" title="资产处置" width="min(92vw, 520px)" destroy-on-close>
      <el-alert
        v-if="disposeRow"
        type="info"
        :closable="false"
        class="dispose-tip"
        :title="`${disposeRow.cardNo} ${disposeRow.name} · 账面净值 ¥ ${fmtMoney(disposeRow.netValue)}`"
      />
      <el-form label-width="100px">
        <el-form-item label="处置方式">
          <el-radio-group v-model="disposeForm.disposeType">
            <el-radio value="出售">出售</el-radio>
            <el-radio value="报废">报废</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="处置日期" required>
          <el-date-picker v-model="disposeForm.disposeDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <template v-if="disposeForm.disposeType === '出售'">
          <el-form-item label="处置金额" required>
            <el-input-number v-model="disposeForm.disposeAmount" :precision="2" :step="100" :min="0" placeholder="出售价款" style="width: 100%" />
          </el-form-item>
          <el-form-item label="结算科目" required>
            <el-select v-model="disposeForm.settleSubjectCode" placeholder="请选择结算资金科目" style="width: 100%">
              <el-option v-for="s in cashSubjects" :key="s.code" :label="`${s.code} ${s.name}`" :value="s.code" />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="disposeVisible = false">取消</el-button>
        <el-button type="danger" :loading="disposeSaving" @click="doDispose">确认处置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import { Plus, Search, RefreshLeft, Box, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { assetList, assetCreate, assetDispose, departmentList, subjectTree } from '@/api/modules'
import { fmtMoney, fmtDate, ASSET_CATEGORIES } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const ASSET_STATUS: Record<number, { label: string; tag: 'success' | 'warning' | 'info' }> = {
  1: { label: '在用', tag: 'success' },
  2: { label: '清理中', tag: 'warning' },
  3: { label: '已处置', tag: 'info' },
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtRate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-'
  return `${Math.round(Number(v) * 10000) / 100}%`
}

const loading = ref(false)
const list = ref<any[]>([])
const query = reactive<{ keyword: string; status?: number | '' }>({ keyword: '', status: '' })
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/assets',
      filename: '固定资产卡片',
      params: {
        keyword: query.keyword.trim() || undefined,
        status: query.status === '' || query.status == null ? undefined : query.status,
      },
      loadingText: '固定资产卡片 Excel',
    })
  } finally {
    exporting.value = false
  }
}

const originalValueTotalFmt = computed(() => fmtMoney(list.value.reduce((s, r) => s + Number(r.originalValue || 0), 0)))
const accumulatedTotalFmt = computed(() => fmtMoney(list.value.reduce((s, r) => s + Number(r.accumulatedDepreciation || 0), 0)))
const netValueTotalFmt = computed(() => fmtMoney(list.value.reduce((s, r) => s + Number(r.netValue || 0), 0)))

async function loadList() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (query.keyword.trim()) params.keyword = query.keyword.trim()
    if (query.status !== '' && query.status !== null && query.status !== undefined) params.status = query.status
    const res: any = await assetList(params)
    list.value = res.list || []
  } catch { /* 拦截器已提示 */ } finally { loading.value = false }
}

function search() { loadList() }
function reset() { query.keyword = ''; query.status = ''; loadList() }

const depts = ref<any[]>([])
const allSubjects = ref<any[]>([])

function collectLeaves(nodes: any[], out: any[] = []): any[] {
  nodes.forEach((n) => {
    if (n.children && n.children.length) collectLeaves(n.children, out)
    else out.push(n)
  })
  return out
}

async function loadBaseData() {
  try {
    const res: any = await departmentList()
    depts.value = res.list || res || []
  } catch { /* 拦截器已提示 */ }
  try {
    const res: any = await subjectTree()
    allSubjects.value = Array.isArray(res.list) && res.list.length ? res.list : collectLeaves(res.tree || [])
  } catch { /* 拦截器已提示 */ }
}

const hasDepExpenseSubject = computed(() => allSubjects.value.some((s) => s.code === '560205'))
const cashSubjects = computed(() => allSubjects.value.filter((s) => s.isLeaf && String(s.code).startsWith('1002')))

const createVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<{
  name: string
  category: string
  acquiredDate: string
  originalValue?: number
  salvageRate?: number
  lifeMonths?: number
  useDeptId?: number | ''
  location: string
  generateVoucher: boolean
}>({
  name: '',
  category: '',
  acquiredDate: '',
  originalValue: undefined,
  salvageRate: 5,
  lifeMonths: undefined,
  useDeptId: '',
  location: '',
  generateVoucher: true,
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入资产名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择资产类别', trigger: 'change' }],
  acquiredDate: [{ required: true, message: '请选择取得日期', trigger: 'change' }],
  originalValue: [{ required: true, message: '请输入资产原值', trigger: 'blur' }],
  lifeMonths: [{ required: true, message: '请输入折旧年限(月)', trigger: 'blur' }],
}

function openCreate() {
  Object.assign(form, {
    name: '', category: '', acquiredDate: todayStr(),
    originalValue: undefined, salvageRate: 5, lifeMonths: undefined,
    useDeptId: '', location: '', generateVoucher: true,
  })
  createVisible.value = true
}

async function doCreate() {
  try { await formRef.value?.validate() } catch { return }
  if (!form.originalValue || Number(form.originalValue) <= 0) { ElMessage.warning('资产原值需大于 0'); return }
  if (!form.lifeMonths || Number(form.lifeMonths) <= 0) { ElMessage.warning('请输入有效的折旧年限(月)'); return }
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category,
      acquiredDate: form.acquiredDate,
      originalValue: Number(form.originalValue),
      salvageRate: Number(form.salvageRate || 0) / 100,
      lifeMonths: Number(form.lifeMonths),
      generateVoucher: form.generateVoucher,
    }
    if (form.useDeptId !== '' && form.useDeptId !== null && form.useDeptId !== undefined) payload.useDeptId = form.useDeptId
    if (form.location && form.location.trim()) payload.location = form.location.trim()
    if (hasDepExpenseSubject.value) payload.depExpenseSubjectCode = '560205'
    await assetCreate(payload)
    ElMessage.success('资产卡片已新增')
    createVisible.value = false
    loadList()
  } catch { /* 拦截器已提示 */ } finally { saving.value = false }
}

const disposeVisible = ref(false)
const disposeSaving = ref(false)
const disposeRow = ref<any>(null)
const disposeForm = reactive<{
  disposeType: '出售' | '报废'
  disposeDate: string
  disposeAmount?: number
  settleSubjectCode: string
}>({ disposeType: '出售', disposeDate: '', disposeAmount: undefined, settleSubjectCode: '100201' })

function openDispose(row: any) {
  disposeRow.value = row
  Object.assign(disposeForm, { disposeType: '出售', disposeDate: todayStr(), disposeAmount: undefined, settleSubjectCode: '100201' })
  disposeVisible.value = true
}

async function doDispose() {
  if (!disposeForm.disposeDate) { ElMessage.warning('请选择处置日期'); return }
  if (disposeForm.disposeType === '出售') {
    if (!disposeForm.disposeAmount || Number(disposeForm.disposeAmount) <= 0) { ElMessage.warning('请输入有效的处置金额'); return }
    if (!disposeForm.settleSubjectCode) { ElMessage.warning('请选择结算资金科目'); return }
  }
  try {
    await ElMessageBox.confirm('处置后将生成处置凭证,是否确认?', '确认处置', { type: 'warning' })
  } catch { return }
  disposeSaving.value = true
  try {
    const data: Record<string, unknown> = {
      disposeDate: disposeForm.disposeDate,
      disposeType: disposeForm.disposeType,
    }
    if (disposeForm.disposeType === '出售') {
      data.disposeAmount = Number(disposeForm.disposeAmount)
      data.settleSubjectCode = disposeForm.settleSubjectCode
    }
    await assetDispose(disposeRow.value.id, data as any)
    ElMessage.success('资产已处置,处置凭证已生成')
    disposeVisible.value = false
    loadList()
  } catch { /* 拦截器已提示 */ } finally { disposeSaving.value = false }
}

onMounted(() => { loadList(); loadBaseData() })
</script>

<style scoped>
.asset-page { display: flex; flex-direction: column; gap: 18px; }

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
.ov-label { font-size: 12px; color: var(--fm-text-3); font-weight: 500; }
.ov-num { font-size: 22px; font-weight: 700; font-family: var(--fm-font-num); color: var(--fm-text-1); letter-spacing: -0.02em; }
.ov-suffix { font-size: 12px; color: var(--fm-text-3); }
.text-brand { color: var(--fm-brand-600); }
.text-warning { color: var(--fm-warning); }
.text-bold { font-weight: 700; }

.code-cell {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  color: var(--fm-text-1);
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  display: inline-block;
}
.name-cell { font-weight: 500; }
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }

.cat-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-pill);
  background: rgba(139,92,246,0.10);
  color: var(--fm-violet-600);
}
html.dark .cat-pill { color: var(--fm-violet-300); }

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
.status-pill.pill-info { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }

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
.action-btn.warn:hover { color: var(--fm-warning); border-color: rgba(245,158,11,0.4); background: var(--fm-warning-soft); }

.dispose-tip { margin-bottom: 14px; }
</style>
