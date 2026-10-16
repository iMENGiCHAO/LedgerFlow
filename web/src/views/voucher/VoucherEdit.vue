<template>
  <div class="voucher-edit">
    <PageHeader
      :icon="Notebook"
      :icon-tone="isEdit ? 'warning' : 'brand'"
      :title="isEdit ? `修改凭证 ${voucherNo(head.word, head.no)}` : '录入凭证'"
      :sub="isEdit ? '已记账的凭证不能修改,如需调整请使用红冲' : '借贷必平,辅助核算按科目规则自动校验'"
    >
      <template #actions>
        <el-dropdown v-if="!isEdit" trigger="click" @command="applyTemplate">
          <el-button :icon="MagicStick" :loading="templatesLoading">应用模板<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="t in templates" :key="t.id" :command="t.id" divided style="display:flex;justify-content:space-between;align-items:center;min-width:220px">
                <span>{{ t.name }}</span>
                <el-button link type="danger" size="small" @click.stop="removeTemplate(t.id)">删除</el-button>
              </el-dropdown-item>
              <el-dropdown-item v-if="!templates.length" disabled>暂无模板,可在录入分录后「存为模板」</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-if="!isEdit" :icon="CollectionTag" @click="saveAsTemplate">存为模板</el-button>
        <el-button :icon="Back" @click="$router.push('/vouchers')">返回列表</el-button>
      </template>
    </PageHeader>

    <SectionCard title="凭证头信息" class="voucher-card">
      <el-form inline class="head-form">
        <el-form-item label="凭证字">
          <el-select v-model="head.word" style="width: 100px" :disabled="isEdit">
            <el-option v-for="w in VOUCHER_WORDS" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
        <el-form-item label="凭证日期">
          <el-date-picker v-model="head.date" type="date" value-format="YYYY-MM-DD" style="width: 170px" />
        </el-form-item>
        <el-form-item label="附单据数">
          <el-input-number v-model="head.attachmentCount" :min="0" :max="999" controls-position="right" style="width: 130px" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="head.memo" placeholder="凭证备注(可选)" style="width: 360px" maxlength="200" />
        </el-form-item>
      </el-form>
    </SectionCard>

    <SectionCard title="分录明细" sub="至少 2 行,借贷必平,辅助核算按科目要求自动加载" class="voucher-card">
      <template #actions>
        <el-button :icon="Plus" size="small" @click="addRow">添加分录</el-button>
      </template>

      <div class="entry-scroll">
        <el-table :data="entries" class="entry-table" :row-class-name="rowClass">
          <el-table-column type="index" label="#" width="50" align="center" />
          <el-table-column label="摘要" min-width="170">
            <template #default="{ row }">
              <el-autocomplete
                v-model="row.summary"
                :fetch-suggestions="querySummary"
                placeholder="本行摘要(可联想)"
                maxlength="200"
                size="default"
                class="summary-auto"
              />
            </template>
          </el-table-column>
          <el-table-column label="会计科目" min-width="240">
            <template #default="{ row }">
              <el-select
                v-model="row.subjectId"
                filterable
                placeholder="选择末级科目"
                style="width: 100%"
                @change="(v: number) => onSubjectChange(row, v)"
              >
                <el-option
                  v-for="s in leafSubjects"
                  :key="s.id"
                  :label="`${s.code} ${s.name}`"
                  :value="s.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="借方金额" width="160">
            <template #default="{ row }">
              <el-input-number
                v-model="row.debit"
                :precision="2"
                :step="100"
                :min="0"
                :max="9999999999"
                controls-position="right"
                class="amt"
                @change="onDebitChange(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="贷方金额" width="160">
            <template #default="{ row }">
              <el-input-number
                v-model="row.credit"
                :precision="2"
                :step="100"
                :min="0"
                :max="9999999999"
                controls-position="right"
                class="amt"
                @change="onCreditChange(row)"
              />
            </template>
          </el-table-column>

          <el-table-column label="辅助核算" min-width="240">
            <template #default="{ row }">
              <div class="assist-cell">
                <el-select
                  v-if="subjectOf(row)?.assist?.partner"
                  v-model="row.partnerId"
                  filterable
                  clearable
                  placeholder="往来单位"
                  size="small"
                  style="width: 100%"
                >
                  <el-option v-for="p in partners" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
                <el-select
                  v-if="subjectOf(row)?.assist?.department"
                  v-model="row.departmentId"
                  clearable
                  placeholder="部门"
                  size="small"
                  style="width: 100%"
                >
                  <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
                </el-select>
                <el-select
                  v-if="subjectOf(row)?.assist?.project"
                  v-model="row.projectId"
                  clearable
                  placeholder="项目"
                  size="small"
                  style="width: 100%"
                >
                  <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
                </el-select>
                <span v-if="!hasAssist(row)" class="muted">-</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="结算方式 / 票据号" min-width="200">
            <template #default="{ row }">
              <div v-if="isCash(row)" class="assist-cell">
                <el-select v-model="row.settleType" clearable placeholder="结算方式" size="small" style="width: 100%">
                  <el-option v-for="t in SETTLE_TYPES" :key="t" :label="t" :value="t" />
                </el-select>
                <el-input v-model="row.settleNo" size="small" placeholder="票据号" maxlength="60" />
              </div>
              <span v-else class="muted">-</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="120" align="center" fixed="right">
            <template #default="{ $index }">
              <button class="row-btn" @click="insertRow($index)">插入</button>
              <button class="row-btn danger" :disabled="entries.length <= 2" @click="removeRow($index)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </SectionCard>

    <!-- 合计条(渐变 + 突出显示) -->
    <div class="totals-bar" :class="{ 'is-balanced': balanced, 'is-unbalanced': !balanced }">
      <div class="totals-bg" />
      <div class="totals-inner">
        <div class="total-item">
          <span class="total-label">借方合计</span>
          <span class="total-value num-cell">¥ {{ fmtMoney(totalDebit) }}</span>
        </div>
        <div class="total-divider" />
        <div class="total-item">
          <span class="total-label">贷方合计</span>
          <span class="total-value num-cell">¥ {{ fmtMoney(totalCredit) }}</span>
        </div>
        <div class="total-divider" />
        <div class="total-item diff">
          <span class="total-label">差额</span>
          <span class="total-value num-cell" :class="balanced ? 'text-success' : 'text-danger'">
            ¥ {{ fmtMoney(diff) }}
          </span>
          <span class="balance-pill" :class="balanced ? 'is-ok' : 'is-bad'">
            <el-icon :size="12"><CircleCheckFilled v-if="balanced" /><WarningFilled v-else /></el-icon>
            {{ balanced ? '借贷平衡' : '借贷不平衡' }}
          </span>
        </div>
        <div class="totals-actions">
          <el-button @click="$router.push('/vouchers')">取消</el-button>
          <el-button type="primary" size="large" :loading="saving" :disabled="!canSave" @click="save">
            {{ isEdit ? '保存修改' : '保存凭证' }}
          </el-button>
        </div>
      </div>
      <div v-if="!canSave" class="save-hint">{{ saveBlockReason }}</div>
    </div>

    <!-- 附件影像:凭证保存后可上传原始单据扫描件(jpg/png/pdf ≤10MB) -->
    <SectionCard v-if="attachmentVoucherId" title="凭证附件" sub="上传发票/合同等原始单据扫描件, jpg/png/pdf, 单个 ≤10MB">
      <template #actions>
        <el-upload
          :show-file-list="false"
          :auto-upload="true"
          accept=".jpg,.jpeg,.png,.pdf"
          :before-upload="beforeAttachmentUpload"
          :http-request="doAttachmentUpload"
        >
          <el-button type="primary" plain :icon="Paperclip" :loading="attachmentUploading">
            上传附件
          </el-button>
        </el-upload>
      </template>
      <div v-if="attachments.length" class="attachment-list">
        <div v-for="a in attachments" :key="a.id" class="attachment-item">
          <span class="att-icon"><el-icon><Paperclip /></el-icon></span>
          <span class="att-name" :title="a.fileName">{{ a.fileName }}</span>
          <span class="att-size">{{ (a.fileSize / 1024).toFixed(0) }} KB</span>
          <el-button link type="primary" :icon="Download" @click="downloadAttachment(a)">下载</el-button>
        </div>
      </div>
      <div v-else class="attachment-empty">暂无附件,可上传原始单据影像备查</div>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Back, Notebook, CircleCheckFilled, WarningFilled, Paperclip, Download, MagicStick, ArrowDown, CollectionTag } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import {
  subjectTree, partnerList, departmentList, projectList,
  voucherCreate, voucherUpdate, voucherDetail,
  voucherAttachmentUpload, voucherAttachmentDownload,
  voucherSummaryList, voucherTemplateList, voucherTemplateRemove, voucherTemplateSave,
} from '@/api/modules'
import { fmtMoney, voucherNo, VOUCHER_WORDS, SETTLE_TYPES } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'

const route = useRoute()
const router = useRouter()

const editId = route.params.id as string | undefined
const isEdit = !!editId

interface EntryRow {
  summary: string
  subjectId?: number
  debit: number | undefined
  credit: number | undefined
  partnerId?: number | null
  departmentId?: number | null
  projectId?: number | null
  settleType?: string | null
  settleNo?: string | null
}

const pageLoading = ref(false)
const saving = ref(false)
const head = reactive({
  word: '记',
  date: dayjs().format('YYYY-MM-DD'),
  attachmentCount: 0,
  memo: '',
  no: undefined as number | undefined,
})

const entries = ref<EntryRow[]>([
  { summary: '', debit: undefined, credit: undefined },
  { summary: '', debit: undefined, credit: undefined },
])

const subjectsAll = ref<any[]>([])
const partners = ref<any[]>([])
const departments = ref<any[]>([])
const projects = ref<any[]>([])

const leafSubjects = computed(() =>
  (subjectsAll.value || []).filter((s) => s.isLeaf && s.status === 1),
)

function subjectOf(row: EntryRow) {
  return leafSubjects.value.find((s) => s.id === row.subjectId)
}

function isCash(row: EntryRow) {
  const s = subjectOf(row)
  if (!s) return false
  return s.code.startsWith('1001') || s.code.startsWith('1002')
}

function hasAssist(row: EntryRow) {
  const a = subjectOf(row)?.assist || {}
  return !!(a.partner || a.department || a.project)
}

function rowClass({ row }: { row: EntryRow }) {
  if (Number(row.debit) > 0) return 'is-debit'
  if (Number(row.credit) > 0) return 'is-credit'
  return ''
}

// ---------- 分录操作 ----------
function addRow() {
  entries.value.push({ summary: '', debit: undefined, credit: undefined })
}

function insertRow(index: number) {
  entries.value.splice(index, 0, { summary: '', debit: undefined, credit: undefined })
}

function removeRow(index: number) {
  if (entries.value.length > 2) entries.value.splice(index, 1)
}

function onDebitChange(row: EntryRow) {
  if (Number(row.debit) > 0) row.credit = undefined
}

function onCreditChange(row: EntryRow) {
  if (Number(row.credit) > 0) row.debit = undefined
}

function onSubjectChange(row: EntryRow, subjectId: number) {
  const s = leafSubjects.value.find((x) => x.id === subjectId)
  const a = s?.assist || {}
  if (!a.partner) row.partnerId = null
  if (!a.department) row.departmentId = null
  if (!a.project) row.projectId = null
  if (!s || !(s.code.startsWith('1001') || s.code.startsWith('1002'))) {
    row.settleType = null
    row.settleNo = null
  }
}

// ---------- 合计 ----------
const totalDebit = computed(() => entries.value.reduce((a, r) => a + Number(r.debit || 0), 0))
const totalCredit = computed(() => entries.value.reduce((a, r) => a + Number(r.credit || 0), 0))
const diff = computed(() => Math.round((totalDebit.value - totalCredit.value) * 100) / 100)
const balanced = computed(() => Math.abs(diff.value) < 0.005)

const hasAmount = computed(() => totalDebit.value > 0)
const allValid = computed(() =>
  entries.value.length >= 2 &&
  entries.value.every((r) => {
    if (!r.subjectId) return false
    const amt = Number(r.debit || 0) + Number(r.credit || 0)
    if (!(amt > 0)) return false
    if (Number(r.debit || 0) > 0 && Number(r.credit || 0) > 0) return false
    const s = subjectOf(r)
    const assist = s?.assist || {}
    if (assist.partner && !r.partnerId) return false
    if (assist.department && !r.departmentId) return false
    if (assist.project && !r.projectId) return false
    return true
  }),
)

const canSave = computed(() => balanced.value && hasAmount.value && allValid.value)

const saveBlockReason = computed(() => {
  if (!allValid.value) return '请完善分录:科目必选、每行仅借或贷一方金额、辅助核算必填'
  if (!hasAmount.value) return '凭证合计金额必须大于零'
  return `借贷不平衡,差额 ${fmtMoney(diff.value)} 元`
})

// ---------- 加载基础数据 ----------
async function loadBase() {
  try {
    const [treeRes, partnerRes] = await Promise.all([
      subjectTree(),
      partnerList({ page: 1, pageSize: 500 }),
    ])
    subjectsAll.value = (treeRes as any).list || []
    partners.value = (partnerRes as any).list || []
  } catch { /* ignore */ }
  try {
    departments.value = ((await departmentList()) as any) || []
  } catch { /* ignore */ }
  try {
    projects.value = ((await projectList()) as any) || []
  } catch { /* ignore */ }
}

async function loadVoucher() {
  pageLoading.value = true
  try {
    const v: any = await voucherDetail(editId!)
    head.word = v.word || '记'
    head.date = dayjs(v.date).format('YYYY-MM-DD')
    head.attachmentCount = v.attachmentCount ?? 0
    attachments.value = v.attachments || []
    head.memo = v.memo || ''
    head.no = v.no
    const rows: EntryRow[] = (v.entries || []).map((e: any) => ({
      summary: e.summary || '',
      subjectId: e.subjectId,
      debit: Number(e.debit) > 0 ? Number(e.debit) : undefined,
      credit: Number(e.credit) > 0 ? Number(e.credit) : undefined,
      partnerId: e.partnerId ?? null,
      departmentId: e.departmentId ?? null,
      projectId: e.projectId ?? null,
      settleType: e.settleType ?? null,
      settleNo: e.settleNo ?? null,
    }))
    if (rows.length >= 2) entries.value = rows
  } catch { /* 拦截器已提示 */ } finally {
    pageLoading.value = false
  }
}

// ---------- 保存 ----------
function buildPayload() {
  return {
    word: head.word,
    date: head.date,
    attachmentCount: head.attachmentCount ?? 0,
    memo: head.memo || undefined,
    entries: entries.value.map((r) => ({
      summary: r.summary || '',
      subjectId: r.subjectId,
      debit: Number(r.debit || 0),
      credit: Number(r.credit || 0),
      partnerId: r.partnerId || null,
      departmentId: r.departmentId || null,
      projectId: r.projectId || null,
      settleType: r.settleType || null,
      settleNo: r.settleNo || null,
    })),
  }
}

async function save() {
  if (!head.date) {
    ElMessage.warning('请选择凭证日期')
    return
  }
  saving.value = true
  try {
    if (isEdit) {
      await voucherUpdate(editId!, buildPayload())
      ElMessage.success('凭证已保存')
      router.push('/vouchers')
      return
    }
    const created: any = await voucherCreate(buildPayload())
    // 保存成功后激活附件区,便于立即上传原始单据影像
    if (created?.id) createdVoucherId.value = Number(created.id)
    try {
      await ElMessageBox.confirm('凭证保存成功,是否继续录入下一张?', '提示', {
        confirmButtonText: '继续录入',
        cancelButtonText: '返回列表',
        type: 'success',
      })
      resetForm()
    } catch {
      router.push('/vouchers')
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

// ==================== 附件影像 ====================
/** 可上传附件的凭证 id:编辑模式=当前凭证;新建模式=保存成功后 */
const attachmentVoucherId = computed(() => (isEdit ? Number(editId) : createdVoucherId.value))
const createdVoucherId = ref<number | null>(null)
const attachments = ref<any[]>([])
const attachmentUploading = ref(false)

function beforeAttachmentUpload(file: File) {
  const okTypes = ['image/jpeg', 'image/png', 'application/pdf']
  if (!okTypes.includes(file.type)) {
    ElMessage.error('仅支持 jpg/png/pdf 附件')
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('附件不能超过10MB')
    return false
  }
  return true
}

async function doAttachmentUpload(opts: { file: File }) {
  const vid = attachmentVoucherId.value
  if (!vid) {
    ElMessage.warning('请先保存凭证再上传附件')
    return
  }
  attachmentUploading.value = true
  try {
    // 拦截器已解包:返回值即 attachment 记录
    const att: any = await voucherAttachmentUpload(vid, opts.file)
    attachments.value.push(att)
    head.attachmentCount = Number(head.attachmentCount || 0) + 1
    ElMessage.success('附件已上传')
  } catch {
    /* 拦截器已提示 */
  } finally {
    attachmentUploading.value = false
  }
}

async function downloadAttachment(a: any) {
  try {
    // 拦截器对 blob 直接透传:返回值即文件 Blob
    const blob = await voucherAttachmentDownload(a.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = a.fileName || 'attachment'
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('附件下载失败')
  }
}

function resetForm() {
  head.word = '记'
  head.date = dayjs().format('YYYY-MM-DD')
  head.attachmentCount = 0
  head.memo = ''
  head.no = undefined
  // 继续录入新凭证:附件区归位隐藏
  createdVoucherId.value = null
  attachments.value = []
  entries.value = [
    { summary: '', debit: undefined, credit: undefined },
    { summary: '', debit: undefined, credit: undefined },
  ]
}

// ---------- 模板 / 摘要联想 / 复制预填 ----------
const templates = ref<any[]>([])
const templatesLoading = ref(false)
const summaryPool = ref<string[]>([])

async function loadTemplates() {
  templatesLoading.value = true
  try {
    const res: any = await voucherTemplateList()
    templates.value = res?.list || []
  } catch { /* 拦截器已提示 */ } finally { templatesLoading.value = false }
}

async function loadSummaries() {
  try {
    const res: any = await voucherSummaryList()
    summaryPool.value = (res?.list || []).map((s: any) => s.text)
  } catch { /* 静默 */ }
}

function querySummary(qs: string, cb: (list: any[]) => void) {
  const kw = (qs || '').trim()
  const list = (!kw ? summaryPool.value : summaryPool.value.filter((t) => t.includes(kw)))
    .slice(0, 8)
    .map((t) => ({ value: t }))
  cb(list)
}

function mapTemplateEntries(raw: any[]): typeof entries.value {
  return (raw || []).map((e: any) => ({
    summary: e.summary || '',
    subjectId: e.subjectId ?? null,
    debit: Number(e.debit) > 0 ? Number(e.debit) : undefined,
    credit: Number(e.credit) > 0 ? Number(e.credit) : undefined,
    partnerId: e.partnerId ?? null,
    departmentId: e.departmentId ?? null,
    projectId: e.projectId ?? null,
    settleType: e.settleType ?? null,
    settleNo: e.settleNo ?? null,
  }))
}

async function applyTemplate(id: number) {
  const t = templates.value.find((x: any) => x.id === id)
  if (!t) return
  const rows = mapTemplateEntries(t.entries || [])
  if (rows.length < 2) { ElMessage.warning('模板分录为空'); return }
  entries.value = rows
  if (t.word) head.word = t.word
  if (t.memo) head.memo = t.memo
  ElMessage.success(`已应用模板「${t.name}」(分录 ${rows.length} 行,请补全科目与金额)`)
}

async function removeTemplate(id: number) {
  try {
    await ElMessageBox.confirm('确认删除该模板?', '提示', { type: 'warning' })
  } catch { return }
  try {
    await voucherTemplateRemove(id)
    ElMessage.success('模板已删除')
    await loadTemplates()
  } catch { /* 拦截器已提示 */ }
}

async function saveAsTemplate() {
  const filled = entries.value.filter((r: any) => r.summary && r.summary.trim())
  if (filled.length < 2) { ElMessage.warning('至少填写 2 行带摘要的分录后再存为模板'); return }
  let name = ''
  try {
    const r = await ElMessageBox.prompt('模板名称', '存为凭证模板', { inputValue: (filled[0].summary || '').slice(0, 20), inputPattern: /^.{1,50}$/, inputErrorMessage: '名称 1-50 字' })
    name = r.value.trim()
  } catch { return }
  try {
    await voucherTemplateSave({
      name,
      word: head.word,
      memo: head.memo || undefined,
      entries: entries.value.map((e: any) => ({
        summary: e.summary || '', subjectId: e.subjectId ?? null,
        debit: e.debit ?? 0, credit: e.credit ?? 0,
        partnerId: e.partnerId ?? null, departmentId: e.departmentId ?? null, projectId: e.projectId ?? null,
        settleType: e.settleType ?? null, settleNo: e.settleNo ?? null,
      })),
    })
    ElMessage.success('模板已保存')
    await loadTemplates()
  } catch { /* 拦截器已提示 */ }
}

/** 列表「复制」入口:读取 sessionStorage 预填(不复制凭证号/日期) */
function consumeCopy() {
  try {
    const raw = sessionStorage.getItem('fm_voucher_copy')
    if (!raw) return
    sessionStorage.removeItem('fm_voucher_copy')
    const data = JSON.parse(raw)
    const rows = mapTemplateEntries(data.entries || [])
    if (rows.length >= 2) {
      entries.value = rows
      if (data.memo) head.memo = data.memo
      if (data.word) head.word = data.word
      ElMessage.success('已载入复制的分录,请确认科目/金额后保存')
    }
  } catch { /* 忽略坏数据 */ }
}

onMounted(async () => {
  await loadBase()
  if (isEdit) {
    loadVoucher()
  } else {
    loadTemplates()
    loadSummaries()
    consumeCopy()
  }
})
</script>

<style scoped>
.voucher-edit { display: flex; flex-direction: column; gap: 18px; }
.summary-auto { width: 100%; }
.voucher-card { margin-bottom: 0; }

.head-form { margin-bottom: -16px; }
.head-form :deep(.el-form-item) { margin-right: 24px; }

.entry-scroll {
  overflow-x: auto;
  border-radius: var(--fm-radius-md);
  margin: 0 -24px -24px;
  padding: 0 24px 24px;
}
.entry-table { min-width: 1080px; }
.entry-table .amt { width: 100%; }
.entry-table :deep(tr.is-debit td:first-child) { box-shadow: inset 3px 0 0 0 var(--fm-brand-500); }
.entry-table :deep(tr.is-credit td:first-child) { box-shadow: inset 3px 0 0 0 var(--fm-warning); }

.assist-cell { display: flex; flex-direction: column; gap: 4px; }

.row-btn {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--fm-border-soft);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-xs);
  cursor: pointer;
  transition: all var(--fm-dur-base) var(--fm-ease);
  font-family: inherit;
  margin: 0 2px;
}
.row-btn:hover:not(:disabled) {
  color: var(--fm-brand-600);
  border-color: var(--fm-brand-300);
  background: rgba(99,102,241,0.04);
}
.row-btn.danger:hover:not(:disabled) {
  color: var(--fm-danger);
  border-color: rgba(239,68,68,0.4);
  background: var(--fm-danger-soft);
}
.row-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 合计条(独立 + 渐变) */
.totals-bar {
  position: sticky;
  bottom: 16px;
  z-index: 10;
  border-radius: var(--fm-radius-md);
  background: var(--fm-bg-elevated);
  border: 1px solid var(--fm-border-soft);
  box-shadow: var(--fm-shadow-md);
  padding: 16px 22px;
  overflow: hidden;
  isolation: isolate;
}
.totals-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(135deg, rgba(99,102,241,0.04) 0%, rgba(139,92,246,0.04) 100%);
}
.totals-bar.is-balanced .totals-bg {
  background: linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(99,102,241,0.04) 100%);
}
.totals-bar.is-unbalanced .totals-bg {
  background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(245,158,11,0.04) 100%);
}
.totals-inner {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.total-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.total-label {
  font-size: 12px;
  color: var(--fm-text-3);
  font-weight: 500;
}
.total-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--fm-text-1);
  font-family: var(--fm-font-num);
  letter-spacing: -0.01em;
}
.total-divider {
  width: 1px;
  height: 24px;
  background: var(--fm-border-soft);
}
.total-item.diff { flex: 1; }
.balance-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--fm-radius-pill);
}
.balance-pill.is-ok  { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.balance-pill.is-bad { background: var(--fm-danger-soft);  color: var(--fm-danger-ink); }
.text-success { color: var(--fm-success); }
.text-danger  { color: var(--fm-danger); }

.totals-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }

.save-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--fm-danger);
  display: flex;
  align-items: center;
  gap: 4px;
}
.save-hint::before { content: '⚠'; }

@media (max-width: 767px) {
  .head-form { display: flex; flex-direction: column; }
  .head-form :deep(.el-form-item) { margin-right: 0; width: 100%; }
  .head-form :deep(.el-form-item .el-input),
  .head-form :deep(.el-form-item .el-select),
  .head-form :deep(.el-form-item .el-date-editor) { width: 100% !important; }
  .totals-bar { padding: 14px 16px; }
  .totals-actions { width: 100%; margin-left: 0; }
  .totals-actions > * { flex: 1; }
}

/* ==================== 附件影像 ==================== */
.attachment-list { display: flex; flex-direction: column; gap: 8px; }
.attachment-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-radius: 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.attachment-item .att-icon { color: var(--el-color-primary); display: inline-flex; }
.attachment-item .att-name {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.attachment-item .att-size { color: var(--el-text-color-secondary); font-size: 12px; white-space: nowrap; }
.attachment-empty { color: var(--el-text-color-placeholder); font-size: 13px; padding: 8px 2px; }
</style>
