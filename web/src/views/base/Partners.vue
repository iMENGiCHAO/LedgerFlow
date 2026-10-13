<template>
  <div class="partners-page">
    <PageHeader
      :icon="OfficeBuilding"
      icon-tone="blue"
      title="往来单位"
      sub="客户与供应商档案 · 维护联系方式、信用政策与基础税务信息"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增往来单位</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <FilterBar>
        <el-select v-model="query.type" placeholder="全部类型" clearable style="width: 140px">
          <el-option label="客户" :value="1" />
          <el-option label="供应商" :value="2" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="编码 / 名称 / 税号"
          clearable
          :prefix-icon="Search"
          style="width: 240px"
          @keyup.enter="search"
        />
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
        <template #extra>
          <span class="filter-meta">
            <el-icon :size="13"><InfoFilled /></el-icon>
            共 {{ total }} 家 · 客户 {{ typeCount(1) }} · 供应商 {{ typeCount(2) }}
          </span>
        </template>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="partner-table">
        <el-table-column prop="code" label="编码" width="110">
          <template #default="{ row }">
            <span class="code-cell">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="name-cell">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <span class="type-pill" :class="row.type === 1 ? 'type-customer' : 'type-supplier'">
              <el-icon :size="11">
                <User v-if="row.type === 1" />
                <Box v-else />
              </el-icon>
              {{ row.type === 1 ? '客户' : '供应商' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="taxNo" label="税号" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="row.taxNo ? 'num-mono' : 'muted'">{{ row.taxNo || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="contact" label="联系人" width="100">
          <template #default="{ row }">{{ row.contact || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="电话" width="130">
          <template #default="{ row }">
            <span :class="row.phone ? 'num-mono' : 'muted'">{{ row.phone || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="creditDays" label="信用天数" width="100" align="right">
          <template #default="{ row }">
            <span class="num-cell">{{ row.creditDays ?? 0 }} <span class="muted small">天</span></span>
          </template>
        </el-table-column>
        <el-table-column label="信用额度" width="140" align="right">
          <template #default="{ row }">
            <span class="num-cell">¥ {{ fmtMoney(row.creditLimit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span class="status-pill" :class="row.status === 1 ? 'pill-success' : 'pill-info'">
              <span class="pill-dot" />
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="right" fixed="right">
          <template #default="{ row }">
            <button class="action-btn" @click="openEdit(row)">编辑</button>
            <button class="action-btn danger" @click="remove(row)">删除</button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无往来单位" description="点击右上角『新增往来单位』建立档案" />
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="load"
          @size-change="onSizeChange"
        />
      </div>
    </SectionCard>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dlgVisible" :title="editing ? '编辑往来单位' : '新增往来单位'" width="min(92vw, 720px)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="编码" prop="code">
              <el-input v-model="form.code" maxlength="32" placeholder="请输入编码" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" maxlength="100" placeholder="请输入名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="类型" prop="type">
              <el-radio-group v-model="form.type">
                <el-radio :value="1">客户</el-radio>
                <el-radio :value="2">供应商</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="税号">
              <el-input v-model="form.taxNo" maxlength="30" placeholder="纳税人识别号(选填)" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="开户银行">
              <el-input v-model="form.bankName" maxlength="60" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="银行账号">
              <el-input v-model="form.bankAccount" maxlength="40" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="form.contact" maxlength="30" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话">
              <el-input v-model="form.phone" maxlength="20" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="信用天数">
              <el-input-number v-model="form.creditDays" :min="0" :step="1" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="信用额度">
              <el-input-number v-model="form.creditLimit" :precision="2" :step="100" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh, RefreshLeft, Search, OfficeBuilding, User, Box, InfoFilled, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { partnerList, removePartner, savePartner } from '@/api/modules'
import { fmtMoney } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const loading = ref(false)
const list = ref<any[]>([])
const total = ref(0)
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/partners',
      filename: '往来单位',
      params: { type: query.type ?? undefined, keyword: query.keyword.trim() || undefined, page: undefined, pageSize: undefined },
      loadingText: '往来单位 Excel',
    })
  } finally {
    exporting.value = false
  }
}

const query = reactive<{ page: number; pageSize: number; type?: number; keyword: string }>({
  page: 1,
  pageSize: 10,
  type: undefined,
  keyword: '',
})

function typeCount(t: number) {
  return list.value.filter((r) => r.type === t).length
}

async function load() {
  loading.value = true
  try {
    const res: any = await partnerList({
      page: query.page,
      pageSize: query.pageSize,
      type: query.type ?? undefined,
      keyword: query.keyword.trim() || undefined,
    })
    list.value = res?.list ?? []
    total.value = Number(res?.total ?? 0)
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

function reset() {
  query.type = undefined
  query.keyword = ''
  search()
}

function onSizeChange(size: number) {
  query.pageSize = size
  query.page = 1
  load()
}

// ---------- 新增 / 编辑 ----------
const dlgVisible = ref(false)
const saving = ref(false)
const editing = ref<any | null>(null)
const formRef = ref<FormInstance>()
const form = reactive({
  code: '',
  name: '',
  type: 1,
  taxNo: '',
  bankName: '',
  bankAccount: '',
  contact: '',
  phone: '',
  creditDays: 30,
  creditLimit: 0,
})
const rules: FormRules = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    code: '',
    name: '',
    type: 1,
    taxNo: '',
    bankName: '',
    bankAccount: '',
    contact: '',
    phone: '',
    creditDays: 30,
    creditLimit: 0,
  })
  dlgVisible.value = true
}

function openEdit(row: any) {
  editing.value = row
  Object.assign(form, {
    code: row.code ?? '',
    name: row.name ?? '',
    type: row.type ?? 1,
    taxNo: row.taxNo ?? '',
    bankName: row.bankName ?? '',
    bankAccount: row.bankAccount ?? '',
    contact: row.contact ?? '',
    phone: row.phone ?? '',
    creditDays: Number(row.creditDays ?? 0),
    creditLimit: Number(row.creditLimit ?? 0),
  })
  dlgVisible.value = true
}

async function submit() {
  await formRef.value?.validate().catch(() => Promise.reject())
  saving.value = true
  try {
    const payload: any = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      taxNo: form.taxNo.trim(),
      bankName: form.bankName.trim(),
      bankAccount: form.bankAccount.trim(),
      contact: form.contact.trim(),
      phone: form.phone.trim(),
      creditDays: form.creditDays,
      creditLimit: form.creditLimit,
    }
    if (editing.value) payload.id = editing.value.id
    await savePartner(payload)
    ElMessage.success(editing.value ? '往来单位已更新' : '往来单位创建成功')
    dlgVisible.value = false
    load()
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

async function remove(row: any) {
  try {
    await ElMessageBox.confirm(`删除后不可恢复,确定删除往来单位「${row.name}」吗?`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await removePartner(row.id)
    ElMessage.success('删除成功')
    if (list.value.length === 1 && query.page > 1) query.page -= 1
    load()
  } catch {
    /* 拦截器已提示 */
  }
}

onMounted(load)
</script>

<style scoped>
.partners-page { display: flex; flex-direction: column; gap: 18px; }
.filter-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--fm-text-3);
}
.code-cell {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  color: var(--fm-text-1);
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
}
.name-cell { font-weight: 500; }
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }

.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
}
.type-customer { background: rgba(99,102,241,0.10); color: var(--fm-brand-600); }
.type-supplier { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
html.dark .type-customer { color: var(--fm-brand-300); }

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
  margin: 0 2px;
}
.action-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); background: rgba(99,102,241,0.04); }
.action-btn.danger:hover { color: var(--fm-danger); border-color: rgba(239,68,68,0.4); background: var(--fm-danger-soft); }

.pager {
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--fm-border-soft);
}
</style>
