<template>
  <div class="roles-page">
    <PageHeader
      :icon="Key"
      icon-tone="violet"
      title="角色权限"
      sub="角色与权限码配置 · 权限目录化 · 细粒度访问控制"
    >
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建角色</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <FilterBar>
        <span class="filter-tip">
          <el-icon :size="13"><InfoFilled /></el-icon>
          共 {{ list.length }} 个角色 · 权限目录 {{ catalog.length }} 项
        </span>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="list" class="role-table">
        <el-table-column label="编码" width="170">
          <template #default="{ row }">
            <span class="code-cell">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="140">
          <template #default="{ row }">
            <span class="name-cell">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="权限数" width="110">
          <template #default="{ row }">
            <span class="perm-count">{{ row.permissions?.length ?? 0 }} <span class="muted small">项</span></span>
          </template>
        </el-table-column>
        <el-table-column label="权限明细" min-width="300">
          <template #default="{ row }">
            <span v-if="!row.permissions?.length" class="muted">-</span>
            <el-tooltip v-else placement="top" effect="dark" :show-after="150">
              <template #content>
                <div style="max-width: 340px; line-height: 1.7">{{ permTexts(row).join(';') }}</div>
              </template>
              <span class="perm-cell">
                <span v-for="c in row.permissions.slice(0, 3)" :key="c" class="perm-pill">{{ permLabel(c) }}</span>
                <span v-if="row.permissions.length > 3" class="more">+{{ row.permissions.length - 3 }}</span>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right" fixed="right">
          <template #default="{ row }">
            <button class="action-btn" @click="openEdit(row)">编辑</button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无角色" description="点击右上角『新建角色』创建" />
        </template>
      </el-table>
    </SectionCard>

    <!-- 新建 / 编辑角色 -->
    <el-dialog
      v-model="dlgVisible"
      :title="editing ? '编辑角色' : '新建角色'"
      width="min(92vw, 720px)"
      destroy-on-close
      top="6vh"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="70px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="编码" prop="code">
              <el-input v-model="form.code" :disabled="!!editing" maxlength="40" placeholder="如 accountant(创建后不可改)" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" maxlength="30" placeholder="如:会计" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" maxlength="100" placeholder="选填" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div class="perm-panel">
        <div class="perm-panel-head">
          <span>功能权限</span>
          <el-checkbox
            :model-value="isAllSelected"
            :indeterminate="isIndeterminate"
            @change="(v: any) => toggleAll(!!v)"
          >
            全选
          </el-checkbox>
        </div>
        <div v-for="g in PERM_GROUPS" :key="g.group" class="perm-group">
          <div class="perm-group-head">
            <el-checkbox
              :model-value="isGroupAll(g)"
              :indeterminate="isGroupIndeterminate(g)"
              @change="(v: any) => toggleGroup(g, !!v)"
            >
              {{ g.group }}
            </el-checkbox>
            <span class="perm-group-count">{{ groupCodes(g).length }} 项</span>
          </div>
          <el-checkbox-group :model-value="selected" class="perm-items" @update:model-value="(v: any) => (selected = v)">
            <el-checkbox v-for="[code, label] in g.items" :key="code" :label="code">{{ label }}</el-checkbox>
          </el-checkbox-group>
        </div>
      </div>

      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh, Key, InfoFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import { permsCatalog, roleCreate, roleList, roleUpdate } from '@/api/modules'

interface PermGroup {
  group: string
  items: [string, string][]
}

/** 前端硬编码权限分组(与后端目录一致) */
const PERM_GROUPS: PermGroup[] = [
  { group: '系统管理', items: [['system:user', '用户管理'], ['system:role', '角色权限'], ['system:log', '操作日志'], ['system:backup', '数据备份']] },
  { group: '基础设置', items: [['md:manage', '基础档案维护(科目/往来单位/部门等)']] },
  {
    group: '账务处理',
    items: [
      ['ledger:init', '期初建账与启用'],
      ['voucher:create', '凭证录入'],
      ['voucher:audit', '凭证审核/记账'],
      ['ledger:view', '账簿查询'],
      ['closing:execute', '期末结账/反结账'],
    ],
  },
  { group: '报表', items: [['report:view', '财务报表查看']] },
  {
    group: '业务模块',
    items: [
      ['arap:manage', '应收应付管理'],
      ['invoice:manage', '发票台账'],
      ['fund:manage', '资金管理与银行对账'],
      ['expense:create', '费用报销申请'],
      ['expense:approve', '费用报销审批'],
      ['expense:pay', '报销付款'],
      ['asset:manage', '固定资产管理'],
      ['dashboard:view', '经营看板'],
    ],
  },
]

const PERM_LABELS: Record<string, string> = {}
PERM_GROUPS.forEach((g) => g.items.forEach(([code, label]) => (PERM_LABELS[code] = label)))
const permLabel = (c: string): string => PERM_LABELS[c] || c

const loading = ref(false)
const list = ref<any[]>([])
const catalog = ref<string[]>([])

async function load() {
  loading.value = true
  try {
    const [rolesRes, catRes] = await Promise.all([roleList(), permsCatalog()] as const)
    const roles: any = rolesRes
    const cat: any = catRes
    list.value = Array.isArray(roles) ? roles : roles?.list ?? []
    catalog.value = Array.isArray(cat) ? cat : []
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function permTexts(row: any): string[] {
  return (row.permissions ?? []).map((c: string) => permLabel(c))
}

// ---------- 新建 / 编辑 ----------
const dlgVisible = ref(false)
const saving = ref(false)
const editing = ref<any | null>(null)
const formRef = ref<FormInstance>()
const form = reactive({ code: '', name: '', remark: '' })
const selected = ref<string[]>([])
const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

function openCreate() {
  editing.value = null
  Object.assign(form, { code: '', name: '', remark: '' })
  selected.value = []
  dlgVisible.value = true
}

function openEdit(row: any) {
  editing.value = row
  Object.assign(form, { code: row.code ?? '', name: row.name ?? '', remark: row.remark ?? '' })
  selected.value = [...(row.permissions ?? [])]
  dlgVisible.value = true
}

function groupCodes(g: PermGroup): string[] {
  return g.items.map(([c]) => c)
}

function isGroupAll(g: PermGroup): boolean {
  return groupCodes(g).every((c) => selected.value.includes(c))
}

function isGroupIndeterminate(g: PermGroup): boolean {
  const n = groupCodes(g).filter((c) => selected.value.includes(c)).length
  return n > 0 && n < groupCodes(g).length
}

function toggleGroup(g: PermGroup, val: boolean) {
  const set = new Set(selected.value)
  groupCodes(g).forEach((c) => (val ? set.add(c) : set.delete(c)))
  selected.value = [...set]
}

const allCodes = PERM_GROUPS.flatMap((g) => groupCodes(g))
const isAllSelected = computed(() => allCodes.every((c) => selected.value.includes(c)))
const isIndeterminate = computed(() => {
  const n = allCodes.filter((c) => selected.value.includes(c)).length
  return n > 0 && n < allCodes.length
})

function toggleAll(val: boolean) {
  selected.value = val ? [...allCodes] : []
}

async function submit() {
  await formRef.value?.validate().catch(() => Promise.reject())
  saving.value = true
  try {
    if (editing.value) {
      await roleUpdate(editing.value.id, {
        name: form.name.trim(),
        permissions: selected.value,
        remark: form.remark.trim(),
      })
      ElMessage.success('角色已更新')
    } else {
      await roleCreate({
        code: form.code.trim(),
        name: form.name.trim(),
        permissions: selected.value,
        remark: form.remark.trim(),
      })
      ElMessage.success('角色创建成功')
    }
    dlgVisible.value = false
    load()
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.roles-page { display: flex; flex-direction: column; gap: 18px; }
.filter-tip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); }
.muted { color: var(--fm-text-3); }
.small { font-size: 11px; }

.code-cell {
  font-family: var(--fm-font-mono);
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--fm-bg-muted);
  border-radius: var(--fm-radius-xs);
  display: inline-block;
}
.name-cell { font-weight: 600; color: var(--fm-text-1); }

.perm-count {
  font-size: 16px;
  font-weight: 700;
  color: var(--fm-brand-600);
  font-family: var(--fm-font-num);
}

.perm-cell { cursor: default; display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.perm-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--fm-radius-xs);
  background: rgba(99,102,241,0.08);
  color: var(--fm-brand-600);
  font-family: var(--fm-font-mono);
}
html.dark .perm-pill { color: var(--fm-brand-300); }
.more { font-size: 11px; color: var(--fm-text-3); margin-left: 2px; }

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

.perm-panel {
  border: 1px solid var(--fm-border-soft);
  border-radius: var(--fm-radius-md);
  padding: 16px 20px;
  max-height: 380px;
  overflow: auto;
  background: var(--fm-bg-muted);
}
.perm-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--fm-border-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--fm-text-1);
}
.perm-group { padding: 12px 0; border-top: 1px solid var(--fm-border-soft); }
.perm-group:first-of-type { border-top: none; }
.perm-group-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.perm-group-head :deep(.el-checkbox__label) {
  font-size: 12px;
  font-weight: 600;
  color: var(--fm-text-2);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.perm-group-count { font-size: 11px; color: var(--fm-text-3); }
.perm-items { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 16px; }
@media (max-width: 600px) { .perm-items { grid-template-columns: 1fr; } }
</style>
