<template>
  <div class="org-page">
    <PageHeader
      :icon="UserFilled"
      icon-tone="violet"
      title="部门 · 项目 · 员工"
      sub="三类基础档案的统一维护 · 用于辅助核算与费用归集"
    >
      <template #actions>
        <el-button :icon="Download" @click="onExport" :loading="exporting">导出Excel</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <el-tabs v-model="activeTab" class="org-tabs">
        <!-- ==================== 部门 ==================== -->
        <el-tab-pane name="dept">
          <template #label>
            <span class="tab-label">
              <el-icon :size="14"><OfficeBuilding /></el-icon>
              部门
              <span class="tab-count">{{ depts.length }}</span>
            </span>
          </template>
          <div class="tab-toolbar">
            <span class="muted">部门用于凭证辅助核算与费用归集</span>
            <el-button type="primary" :icon="Plus" @click="openDeptDlg">新增部门</el-button>
          </div>
          <el-table v-loading="deptLoading" :data="depts" class="org-table">
            <el-table-column label="编码" width="160">
              <template #default="{ row }">
                <span class="code-cell">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="200">
              <template #default="{ row }">
                <span class="name-cell">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="160">
              <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无部门" description="点击右上角『新增部门』创建第一个部门" />
            </template>
          </el-table>
        </el-tab-pane>

        <!-- ==================== 项目 ==================== -->
        <el-tab-pane name="project">
          <template #label>
            <span class="tab-label">
              <el-icon :size="14"><Flag /></el-icon>
              项目
              <span class="tab-count">{{ projects.length }}</span>
            </span>
          </template>
          <div class="tab-toolbar">
            <span class="muted">项目用于专项成本归集与多维核算</span>
            <el-button type="primary" :icon="Plus" @click="openProjDlg">新增项目</el-button>
          </div>
          <el-table v-loading="projLoading" :data="projects" class="org-table">
            <el-table-column label="编码" width="160">
              <template #default="{ row }">
                <span class="code-cell">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="200">
              <template #default="{ row }">
                <span class="name-cell">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="160">
              <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无项目" description="点击右上角『新增项目』建立项目档案" />
            </template>
          </el-table>
        </el-tab-pane>

        <!-- ==================== 员工 ==================== -->
        <el-tab-pane name="employee">
          <template #label>
            <span class="tab-label">
              <el-icon :size="14"><Avatar /></el-icon>
              员工
              <span class="tab-count">{{ employees.length }}</span>
            </span>
          </template>
          <div class="tab-toolbar">
            <span class="muted">员工档案用于报销单据与权限归属</span>
            <el-button type="primary" :icon="Plus" @click="openEmpDlg">新增员工</el-button>
          </div>
          <el-table v-loading="empLoading" :data="employees" class="org-table">
            <el-table-column label="编码" width="140">
              <template #default="{ row }">
                <span class="code-cell">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="姓名" min-width="140">
              <template #default="{ row }">
                <span class="name-cell">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="部门" min-width="160">
              <template #default="{ row }">
                <span v-if="deptNameMap[row.deptId]" class="dept-pill">
                  <el-icon :size="11"><OfficeBuilding /></el-icon>
                  {{ deptNameMap[row.deptId] }}
                </span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="position" label="职位" width="140">
              <template #default="{ row }">{{ row.position || '-' }}</template>
            </el-table-column>
            <el-table-column prop="phone" label="电话" width="150">
              <template #default="{ row }">
                <span :class="row.phone ? 'num-mono' : 'muted'">{{ row.phone || '-' }}</span>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无员工" description="点击右上角『新增员工』并选择所属部门" />
            </template>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </SectionCard>

    <!-- 新增部门 -->
    <el-dialog v-model="deptDlgVisible" title="新增部门" width="min(92vw, 480px)" destroy-on-close>
      <el-form ref="deptFormRef" :model="deptForm" :rules="baseRules" label-width="70px">
        <el-form-item label="编码" prop="code">
          <el-input v-model="deptForm.code" maxlength="32" placeholder="请输入部门编码,如 D001" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="deptForm.name" maxlength="50" placeholder="请输入部门名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="deptSaving" @click="submitDept">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增项目 -->
    <el-dialog v-model="projDlgVisible" title="新增项目" width="min(92vw, 480px)" destroy-on-close>
      <el-form ref="projFormRef" :model="projForm" :rules="baseRules" label-width="70px">
        <el-form-item label="编码" prop="code">
          <el-input v-model="projForm.code" maxlength="32" placeholder="请输入项目编码,如 P001" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="projForm.name" maxlength="50" placeholder="请输入项目名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="projSaving" @click="submitProj">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增员工 -->
    <el-dialog v-model="empDlgVisible" title="新增员工" width="min(92vw, 480px)" destroy-on-close>
      <el-form ref="empFormRef" :model="empForm" :rules="empRules" label-width="70px">
        <el-form-item label="编码" prop="code">
          <el-input v-model="empForm.code" maxlength="32" placeholder="请输入员工编码,如 E001" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="empForm.name" maxlength="50" placeholder="请输入员工姓名" />
        </el-form-item>
        <el-form-item label="部门" prop="deptId">
          <el-select v-model="empForm.deptId" filterable placeholder="请选择所属部门" style="width: 100%">
            <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="职位">
          <el-input v-model="empForm.position" maxlength="50" placeholder="选填" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="empForm.phone" maxlength="20" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="empDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="empSaving" @click="submitEmp">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, UserFilled, OfficeBuilding, Flag, Avatar, Download } from '@element-plus/icons-vue'
import { exportExcel } from '@/utils/exporter'
import {
  departmentList,
  employeeList,
  projectList,
  saveDepartment,
  saveEmployee,
  saveProject,
} from '@/api/modules'
import { fmtDate } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import EmptyState from '@/components/EmptyState.vue'

const activeTab = ref('dept')
const exporting = ref(false)

async function onExport() {
  exporting.value = true
  try {
    const tab = activeTab.value
    if (tab === 'dept') {
      await exportExcel({ url: '/departments', filename: '部门档案', loadingText: '部门档案 Excel' })
    } else if (tab === 'project') {
      await exportExcel({ url: '/projects', filename: '项目档案', loadingText: '项目档案 Excel' })
    } else {
      await exportExcel({ url: '/employees', filename: '员工档案', loadingText: '员工档案 Excel' })
    }
  } finally {
    exporting.value = false
  }
}

// ---------- 部门 ----------
const deptLoading = ref(false)
const depts = ref<any[]>([])
const deptNameMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  depts.value.forEach((d) => (map[d.id] = d.name))
  return map
})

async function loadDepts() {
  deptLoading.value = true
  try {
    const res: any = await departmentList()
    depts.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  } finally {
    deptLoading.value = false
  }
}

// ---------- 项目 ----------
const projLoading = ref(false)
const projects = ref<any[]>([])

async function loadProjects() {
  projLoading.value = true
  try {
    const res: any = await projectList()
    projects.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  } finally {
    projLoading.value = false
  }
}

// ---------- 员工 ----------
const empLoading = ref(false)
const employees = ref<any[]>([])

async function loadEmployees() {
  empLoading.value = true
  try {
    const res: any = await employeeList()
    employees.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  } finally {
    empLoading.value = false
  }
}

onMounted(() => {
  loadDepts()
  loadProjects()
  loadEmployees()
})

// ---------- 部门 / 项目 公共校验 ----------
const baseRules: FormRules = {
  code: [{ required: true, message: '请输入编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
}

// ---------- 新增部门 ----------
const deptDlgVisible = ref(false)
const deptSaving = ref(false)
const deptFormRef = ref<FormInstance>()
const deptForm = reactive({ code: '', name: '' })

function openDeptDlg() {
  deptForm.code = ''
  deptForm.name = ''
  deptDlgVisible.value = true
}

async function submitDept() {
  await deptFormRef.value?.validate().catch(() => Promise.reject())
  deptSaving.value = true
  try {
    await saveDepartment({ code: deptForm.code.trim(), name: deptForm.name.trim() })
    ElMessage.success('部门创建成功')
    deptDlgVisible.value = false
    loadDepts()
  } catch {
    /* 拦截器已提示 */
  } finally {
    deptSaving.value = false
  }
}

// ---------- 新增项目 ----------
const projDlgVisible = ref(false)
const projSaving = ref(false)
const projFormRef = ref<FormInstance>()
const projForm = reactive({ code: '', name: '' })

function openProjDlg() {
  projForm.code = ''
  projForm.name = ''
  projDlgVisible.value = true
}

async function submitProj() {
  await projFormRef.value?.validate().catch(() => Promise.reject())
  projSaving.value = true
  try {
    await saveProject({ code: projForm.code.trim(), name: projForm.name.trim() })
    ElMessage.success('项目创建成功')
    projDlgVisible.value = false
    loadProjects()
  } catch {
    /* 拦截器已提示 */
  } finally {
    projSaving.value = false
  }
}

// ---------- 新增员工 ----------
const empDlgVisible = ref(false)
const empSaving = ref(false)
const empFormRef = ref<FormInstance>()
const empForm = reactive<{ code: string; name: string; deptId?: number; position: string; phone: string }>({
  code: '',
  name: '',
  deptId: undefined,
  position: '',
  phone: '',
})
const empRules: FormRules = {
  code: [{ required: true, message: '请输入员工编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入员工姓名', trigger: 'blur' }],
  deptId: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
}

function openEmpDlg() {
  if (!depts.value.length) loadDepts()
  Object.assign(empForm, { code: '', name: '', deptId: undefined, position: '', phone: '' })
  empDlgVisible.value = true
}

async function submitEmp() {
  await empFormRef.value?.validate().catch(() => Promise.reject())
  empSaving.value = true
  try {
    await saveEmployee({
      code: empForm.code.trim(),
      name: empForm.name.trim(),
      deptId: empForm.deptId,
      position: empForm.position.trim(),
      phone: empForm.phone.trim(),
    })
    ElMessage.success('员工创建成功')
    empDlgVisible.value = false
    loadEmployees()
  } catch {
    /* 拦截器已提示 */
  } finally {
    empSaving.value = false
  }
}
</script>

<style scoped>
.org-page { display: flex; flex-direction: column; gap: 18px; }
.org-tabs { padding: 0 24px; }
.org-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.org-tabs :deep(.el-tabs__nav-wrap)::after { background: var(--fm-border-soft); }

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-pill);
}
.org-tabs :deep(.el-tabs__item.is-active) .tab-count {
  background: var(--fm-gradient-hero);
  color: #fff;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--fm-space-3);
  margin: 4px 0 16px;
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
.dept-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
  background: rgba(99,102,241,0.10);
  color: var(--fm-brand-600);
}
html.dark .dept-pill { color: var(--fm-brand-300); }

.muted { font-size: 12px; color: var(--fm-text-3); }
</style>
