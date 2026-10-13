<template>
  <div class="subjects-page">
    <PageHeader
      :icon="Menu"
      icon-tone="brand"
      title="科目管理"
      sub="科目体系按 4 位一级逐级编码 · 支持启用/停用 · 末级科目可被凭证引用"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增科目</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <FilterBar>
        <el-input
          v-model="keyword"
          placeholder="输入科目编码或名称过滤"
          clearable
          :prefix-icon="Search"
          style="width: 320px"
        />
        <template #extra>
          <span class="filter-meta">
            <el-icon :size="13"><InfoFilled /></el-icon>
            共 {{ flat.length }} 个科目 · 末级 {{ leafCount }} 个
          </span>
        </template>
      </FilterBar>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="tree"
        row-key="id"
        :tree-props="{ children: 'children' }"
        default-expand-all
        :filter-node-method="filterNode"
        class="subject-table"
      >
        <el-table-column prop="code" label="科目编码" width="160">
          <template #default="{ row }">
            <span class="code-cell">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="科目名称" min-width="200">
          <template #default="{ row }">
            <span :class="['name-cell', { 'is-leaf': row.isLeaf }]">{{ row.name }}</span>
            <el-tag v-if="row.isLeaf" size="small" type="primary" effect="plain" class="leaf-tag">末级</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类别" width="110">
          <template #default="{ row }">
            <span class="cat-pill" :class="`cat-${row.category}`">{{ CATEGORY_NAMES[row.category] || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="80" align="center">
          <template #default="{ row }">
            <span class="dir-pill" :class="`dir-${row.direction}`">
              {{ row.direction === 'D' ? '借' : '贷' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="辅助核算" min-width="180">
          <template #default="{ row }">
            <div v-if="row.isLeaf" class="assist-tags">
              <span v-if="assistFlags(row.assist).partner" class="assist-tag">往来单位</span>
              <span v-if="assistFlags(row.assist).department" class="assist-tag">部门</span>
              <span v-if="assistFlags(row.assist).project" class="assist-tag">项目</span>
              <span v-if="!hasAnyAssist(row.assist)" class="muted">-</span>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-pill" :class="row.status === 1 ? 'pill-success' : 'pill-info'">
              <span class="pill-dot" />
              {{ row.status === 1 ? '启用' : '停用' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right" fixed="right">
          <template #default="{ row }">
            <button v-if="row.status === 1" class="action-btn danger" @click="toggleStatus(row)">停用</button>
            <button v-else class="action-btn" @click="toggleStatus(row)">启用</button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无科目" description="点击右上角『新增科目』建立科目档案" />
        </template>
      </el-table>
    </SectionCard>

    <!-- 新增科目 -->
    <el-dialog v-model="dlgVisible" title="新增科目" width="min(92vw, 500px)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="科目编码" prop="code">
          <el-input v-model="form.code" maxlength="10" placeholder="如 100201,上级由编码前缀自动识别" />
        </el-form-item>
        <el-form-item label="科目名称" prop="name">
          <el-input v-model="form.name" maxlength="50" placeholder="请输入科目名称" />
        </el-form-item>
      </el-form>
      <div class="parent-hint" :class="{ 'is-danger': parentHint?.danger }" v-if="parentHint">
        <el-icon :size="14"><InfoFilled v-if="!parentHint.danger" /><WarningFilled v-else /></el-icon>
        <span>{{ parentHint.text }}</span>
      </div>
      <p v-else class="parent-hint muted">
        <el-icon :size="14"><InfoFilled /></el-icon>
        一级科目必须是准则预置科目;下级科目由编码前缀自动挂接上级。
      </p>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules, TableInstance } from 'element-plus'
import { Plus, Refresh, Search, Menu, InfoFilled, WarningFilled, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import { createSubject, subjectTree, updateSubject } from '@/api/modules'
import type { SubjectNode } from '@/api/modules'
import { CATEGORY_NAMES, assistFlags } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'

const loading = ref(false)
const tree = ref<SubjectNode[]>([])
const flat = ref<SubjectNode[]>([])
const keyword = ref('')
const tableRef = ref<TableInstance>()
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    await exportExcel({
      url: '/subjects/list',
      filename: '会计科目表',
      params: { keyword: keyword.value.trim() || undefined },
      loadingText: '会计科目表 Excel',
    })
  } finally {
    exporting.value = false
  }
}

const leafCount = computed(() => flat.value.filter((s) => s.isLeaf).length)

async function load() {
  loading.value = true
  try {
    const res = await subjectTree()
    flat.value = res?.list ?? []
    tree.value = res?.tree ?? []
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

onMounted(load)

watch(keyword, (v) => tableRef.value?.filter(v as never))

function filterNode(value: string, data: SubjectNode) {
  if (!value) return true
  return (data.code || '').includes(value) || (data.name || '').includes(value)
}

function hasAnyAssist(assist?: Record<string, boolean> | null) {
  if (!assist) return false
  return !!(assist.partner || assist.department || assist.project)
}

async function toggleStatus(row: SubjectNode) {
  const target = row.status === 1 ? 0 : 1
  try {
    await ElMessageBox.confirm(
      `确定${target === 0 ? '停用' : '启用'}科目「${row.code} ${row.name}」吗?${
        target === 0 ? '停用后该科目不可用于新凭证录入。' : ''
      }`,
      '提示',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await updateSubject(row.id, { status: target })
    ElMessage.success(target === 0 ? '科目已停用' : '科目已启用')
    load()
  } catch {
    /* 拦截器已提示 */
  }
}

// ---------- 新增科目 ----------
const dlgVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ code: '', name: '' })
const rules: FormRules = {
  code: [
    { required: true, message: '请输入科目编码', trigger: 'blur' },
    { pattern: /^\d{4,10}$/, message: '科目编码为4-10位数字', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入科目名称', trigger: 'blur' }],
}

function openCreate() {
  form.code = ''
  form.name = ''
  dlgVisible.value = true
}

const parentHint = computed<{ text: string; danger: boolean } | null>(() => {
  const code = form.code.trim()
  if (!code) return null
  if (code.length <= 4) return { text: '将创建为一级科目(一级科目必须是准则预置科目)', danger: false }
  const parentCode = code.slice(0, -2)
  const parent = flat.value.find((s) => s.code === parentCode)
  if (parent) return { text: `上级科目:${parent.code} ${parent.name}`, danger: false }
  return { text: '上级科目不存在,请检查编码前缀', danger: true }
})

async function submit() {
  await formRef.value?.validate().catch(() => Promise.reject())
  saving.value = true
  try {
    await createSubject({ code: form.code.trim(), name: form.name.trim() })
    ElMessage.success('科目创建成功')
    dlgVisible.value = false
    load()
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.subjects-page { display: flex; flex-direction: column; gap: 18px; }

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
  font-size: 13px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
}
.name-cell { font-weight: 500; }
.name-cell.is-leaf { font-weight: 600; color: var(--fm-text-1); }
.leaf-tag { margin-left: 8px; vertical-align: middle; }

.cat-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
}
.cat-1 { background: var(--fm-success-soft); color: var(--fm-success-ink); }
.cat-2 { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
.cat-3 { background: rgba(99,102,241,0.10); color: var(--fm-brand-600); }
.cat-4 { background: var(--fm-info-soft); color: var(--fm-info); }
.cat-5 { background: rgba(139,92,246,0.10); color: var(--fm-violet-600); }
.cat-6 { background: var(--fm-danger-soft); color: var(--fm-danger-ink); }
html.dark .cat-3 { color: var(--fm-brand-300); }
html.dark .cat-5 { color: var(--fm-violet-300); }
html.dark .cat-4 { color: #38bdf8; }

.dir-pill {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--fm-radius-xs);
  min-width: 30px;
  text-align: center;
}
.dir-D { background: var(--fm-brand-50); color: var(--fm-brand-600); }
.dir-C { background: var(--fm-warning-soft); color: var(--fm-warning-ink); }
html.dark .dir-D { background: rgba(99,102,241,0.15); color: var(--fm-brand-300); }

.assist-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.assist-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--fm-radius-xs);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  border: 1px solid var(--fm-border-soft);
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
.action-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); background: rgba(99,102,241,0.04); }
.action-btn.danger:hover { color: var(--fm-danger); border-color: rgba(239,68,68,0.4); background: var(--fm-danger-soft); }

.parent-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--fm-text-2);
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-sm);
  border-left: 3px solid var(--fm-brand-500);
  line-height: 1.6;
}
.parent-hint.is-danger { background: var(--fm-danger-soft); color: var(--fm-danger-ink); border-left-color: var(--fm-danger); }
.parent-hint.muted { background: var(--fm-bg-muted); color: var(--fm-text-3); border-left-color: var(--fm-text-3); }
</style>
