<template>
  <div class="users-page">
    <PageHeader
      :icon="UserFilled"
      icon-tone="blue"
      title="用户管理"
      sub="账号 · 角色 · 账套授权 · 状态启停"
    >
      <template #actions>
        <el-button v-if="activeTab === 'users'" type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
      </template>
    </PageHeader>

    <SectionCard padless>
      <el-tabs v-model="activeTab" class="users-tabs">
        <el-tab-pane name="users">
          <template #label>
            <span class="tab-label">
              <el-icon :size="14"><User /></el-icon>用户 <span class="tab-count">{{ userList.length }}</span>
            </span>
          </template>
          <FilterBar>
            <el-input
              v-model="uQuery.keyword"
              placeholder="用户名 / 姓名"
              clearable
              :prefix-icon="Search"
              style="width: 240px"
              @keyup.enter="searchUsers"
            />
            <el-button type="primary" :icon="Search" @click="searchUsers">查询</el-button>
            <el-button :icon="RefreshLeft" @click="resetUserQuery">重置</el-button>
          </FilterBar>

          <el-table v-loading="uLoading" :data="userList" class="user-table">
            <el-table-column prop="id" label="ID" width="70">
              <template #default="{ row }"><span class="num-mono">{{ row.id }}</span></template>
            </el-table-column>
            <el-table-column prop="username" label="用户名" width="150">
              <template #default="{ row }">
                <div class="user-cell">
                  <div class="user-avatar">{{ (row.realName || row.username || '?').slice(0, 1) }}</div>
                  <div>
                    <div class="user-name">{{ row.username }}</div>
                    <div class="user-real">{{ row.realName || '-' }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机" width="140">
              <template #default="{ row }">
                <span :class="row.phone ? 'num-mono' : 'muted'">{{ row.phone || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.email || '-' }}</template>
            </el-table-column>
            <el-table-column label="超级管理员" width="120">
              <template #default="{ row }">
                <span v-if="row.isSuper" class="status-pill pill-danger">
                  <el-icon :size="11"><Star /></el-icon>超级
                </span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="角色" min-width="160">
              <template #default="{ row }">
                <div v-if="row.userRoles?.length" class="tag-cluster">
                  <span v-for="ur in row.userRoles" :key="ur.role?.id ?? ur.tenantId" class="role-pill">
                    {{ ur.role?.name || '-' }}
                  </span>
                </div>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="所属账套" min-width="180">
              <template #default="{ row }">
                <div v-if="row.userTenants?.length" class="tag-cluster">
                  <span v-for="(ut, i) in row.userTenants" :key="ut.tenantId ?? i" class="tenant-pill" :class="{ 'is-default': ut.isDefault }">
                    {{ ut.tenant?.name || `账套${ut.tenantId}` }}
                    <span v-if="ut.isDefault" class="default-mark">默认</span>
                  </span>
                </div>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <span class="status-pill" :class="row.status === 1 ? 'pill-success' : 'pill-danger'">
                  <span class="pill-dot" />
                  {{ row.status === 1 ? '正常' : '禁用' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="right" fixed="right">
              <template #default="{ row }">
                <button class="action-btn" @click="openEdit(row)">编辑</button>
                <button class="action-btn warn" @click="resetPwd(row)">重置密码</button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无用户" description="点击右上角『新增用户』创建账号" />
            </template>
          </el-table>

          <el-pagination
            v-model:current-page="uQuery.page"
            v-model:page-size="uQuery.pageSize"
            class="pager"
            layout="total, sizes, prev, pager, next"
            :total="uTotal"
            :page-sizes="[10, 20, 50, 100]"
            @current-change="loadUsers"
            @size-change="onUserSizeChange"
          />
        </el-tab-pane>

        <!-- ==================== 账套列表 ==================== -->
        <el-tab-pane name="tenants">
          <template #label>
            <span class="tab-label">
              <el-icon :size="14"><OfficeBuilding /></el-icon>账套 <span class="tab-count">{{ tenants.length }}</span>
            </span>
          </template>
          <FilterBar>
            <span class="filter-tip">
              <el-icon :size="13"><InfoFilled /></el-icon>
              共 {{ tenants.length }} 个账套
            </span>
            <el-button type="primary" :icon="Plus" @click="openTenantDlg">新建账套</el-button>
            <el-button :icon="Refresh" @click="loadTenants">刷新</el-button>
          </FilterBar>

          <el-table v-loading="tLoading" :data="tenants" class="tenant-table">
            <el-table-column prop="id" label="ID" width="80">
              <template #default="{ row }"><span class="num-mono">{{ row.id }}</span></template>
            </el-table-column>
            <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="name-cell">
                  <el-icon :size="14" class="tenant-icon"><OfficeBuilding /></el-icon>
                  {{ row.name }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="taxNo" label="税号" width="200">
              <template #default="{ row }">
                <span :class="row.taxNo ? 'num-mono' : 'muted'">{{ row.taxNo || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.address || '-' }}</template>
            </el-table-column>
            <el-table-column prop="legalRep" label="法定代表人" width="130">
              <template #default="{ row }">{{ row.legalRep || '-' }}</template>
            </el-table-column>
            <el-table-column label="起始期间" width="130">
              <template #default="{ row }">
                <span class="period-pill">{{ startPeriod(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="凭证数" width="110" align="right">
              <template #default="{ row }">
                <span class="num-cell text-brand">{{ row._count?.vouchers ?? 0 }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <span class="status-pill" :class="row.status === 1 ? 'pill-success' : 'pill-info'">
                  <span class="pill-dot" />
                  {{ row.status === 1 ? '启用' : '未启用' }}
                </span>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无账套" description="点击『新建账套』开始建立账套" />
            </template>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </SectionCard>

    <!-- 新增 / 编辑用户 -->
    <el-dialog v-model="dlgVisible" :title="editing ? '编辑用户' : '新增用户'" width="min(92vw, 720px)" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="form.username" :disabled="!!editing" maxlength="32" placeholder="登录账号" />
            </el-form-item>
          </el-col>
          <el-col v-if="!editing" :span="12">
            <el-form-item label="初始密码" prop="password">
              <el-input v-model="form.password" type="password" show-password autocomplete="new-password" placeholder="至少6位" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="realName">
              <el-input v-model="form.realName" maxlength="30" placeholder="真实姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机">
              <el-input v-model="form.phone" maxlength="20" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" maxlength="50" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="角色">
              <el-select v-model="form.roleIds" multiple filterable placeholder="选择角色(可多选)" style="width: 100%">
                <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="所属账套">
              <el-select v-model="form.tenantIds" multiple filterable placeholder="可授权多个账套" style="width: 100%">
                <el-option v-for="t in myTenants" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="所属部门">
              <el-select v-model="form.deptId" clearable filterable placeholder="选择所属部门(报销审批用)" style="width: 100%">
                <el-option v-for="d in departments" :key="d.id" :label="`${d.code} ${d.name}`" :value="d.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="超管">
              <el-switch v-model="form.isSuper" active-text="是" inactive-text="否" />
            </el-form-item>
          </el-col>
          <el-col v-if="editing" :span="12">
            <el-form-item label="状态">
              <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="正常" inactive-text="禁用" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新建账套 -->
    <el-dialog v-model="tenantDlgVisible" title="新建账套" width="min(92vw, 720px)" destroy-on-close>
      <el-form ref="tenantFormRef" :model="tenantForm" :rules="tenantRules" label-width="90px">
        <el-form-item label="账套名称" prop="name">
          <el-input v-model="tenantForm.name" maxlength="60" placeholder="如:XX有限公司" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="起始年份" prop="startYear">
              <el-input-number v-model="tenantForm.startYear" :min="2000" :max="2100" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="起始月份" prop="startMonth">
              <el-select v-model="tenantForm.startMonth" style="width: 100%">
                <el-option v-for="m in 12" :key="m" :label="m + '月'" :value="m" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="税号">
          <el-input v-model="tenantForm.taxNo" maxlength="30" placeholder="纳税人识别号(选填)" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="tenantForm.address" maxlength="120" placeholder="选填" />
        </el-form-item>
        <el-form-item label="法定代表人">
          <el-input v-model="tenantForm.legalRep" maxlength="30" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tenantDlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="tenantSaving" @click="submitTenant">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh, RefreshLeft, Search, UserFilled, User, Star, OfficeBuilding, InfoFilled } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import FilterBar from '@/components/FilterBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  roleList,
  tenantAllList,
  tenantCreate,
  tenantMyList,
  userCreate,
  userList,
  userResetPassword,
  userUpdate,
  departmentList,
} from '@/api/modules'

const activeTab = ref<'users' | 'tenants'>('users')

// ==================== 用户 ====================
const uLoading = ref(false)
const userList = ref<any[]>([])
const uTotal = ref(0)
const uQuery = reactive({ page: 1, pageSize: 10, keyword: '' })

async function loadUsers() {
  uLoading.value = true
  try {
    const res: any = await userList({
      page: uQuery.page,
      pageSize: uQuery.pageSize,
      keyword: uQuery.keyword.trim() || undefined,
    })
    userList.value = res?.list ?? []
    uTotal.value = Number(res?.total ?? 0)
  } catch {
    /* 拦截器已提示 */
  } finally {
    uLoading.value = false
  }
}

function searchUsers() {
  uQuery.page = 1
  loadUsers()
}

function resetUserQuery() {
  uQuery.keyword = ''
  searchUsers()
}

function onUserSizeChange(size: number) {
  uQuery.pageSize = size
  uQuery.page = 1
  loadUsers()
}

// ---------- 角色 / 账套 / 部门下拉数据 ----------
const roleOptions = ref<any[]>([])
const myTenants = ref<any[]>([])
const departments = ref<any[]>([])

async function loadOptions() {
  try {
    const res: any = await roleList()
    roleOptions.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  }
  try {
    const res: any = await tenantMyList()
    myTenants.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  }
  try {
    const res: any = await departmentList()
    departments.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 部门列表加载失败不影响主流程 */
  }
}

// ---------- 新增 / 编辑 ----------
const dlgVisible = ref(false)
const saving = ref(false)
const editing = ref<any | null>(null)
const formRef = ref<FormInstance>()
const form = reactive({
  username: '',
  password: '',
  realName: '',
  phone: '',
  email: '',
  isSuper: false,
  status: 1,
  deptId: null as number | null,
  roleIds: [] as number[],
  tenantIds: [] as number[],
})

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]{3,32}$/, message: '3-32位字母、数字或下划线', trigger: 'blur' },
  ],
  password: editing.value
    ? []
    : [
        { required: true, message: '请输入初始密码', trigger: 'blur' },
        { min: 6, message: '密码至少6位', trigger: 'blur' },
      ],
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
}))

function openCreate() {
  editing.value = null
  Object.assign(form, {
    username: '',
    password: '',
    realName: '',
    phone: '',
    email: '',
    isSuper: false,
    status: 1,
    deptId: null,
    roleIds: [],
    tenantIds: [],
  })
  dlgVisible.value = true
}

function openEdit(row: any) {
  editing.value = row
  Object.assign(form, {
    username: row.username ?? '',
    password: '',
    realName: row.realName ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    isSuper: !!row.isSuper,
    status: row.status === 1 ? 1 : 0,
    deptId: row.deptId ?? null,
    roleIds: (row.userRoles ?? []).map((ur: any) => ur.role?.id).filter(Boolean),
    tenantIds: (row.userTenants ?? []).map((ut: any) => ut.tenantId).filter(Boolean),
  })
  dlgVisible.value = true
}

async function submit() {
  await formRef.value?.validate().catch(() => Promise.reject())
  saving.value = true
  try {
    if (editing.value) {
      await userUpdate(editing.value.id, {
        realName: form.realName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        status: form.status,
        isSuper: form.isSuper,
        deptId: form.deptId,
        roleIds: form.roleIds,
        tenantIds: form.tenantIds,
      })
      ElMessage.success('用户已更新')
    } else {
      await userCreate({
        username: form.username.trim(),
        password: form.password,
        realName: form.realName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        isSuper: form.isSuper,
        deptId: form.deptId,
        roleIds: form.roleIds,
        tenantIds: form.tenantIds,
      })
      ElMessage.success('用户创建成功')
    }
    dlgVisible.value = false
    loadUsers()
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

// ---------- 重置密码 ----------
async function resetPwd(row: any) {
  let pwd = ''
  try {
    const res = await ElMessageBox.prompt(`请为用户「${row.username}」设置新密码`, '重置密码', {
      type: 'warning',
      inputType: 'password',
      inputPlaceholder: '至少6位',
      inputValidator: (v: string) => (!v || v.length < 6 ? '密码至少6位' : true),
    })
    pwd = res.value
  } catch {
    return
  }
  try {
    await userResetPassword(row.id, pwd)
    ElMessage.success(`已重置「${row.username}」的密码`)
  } catch {
    /* 拦截器已提示 */
  }
}

// ==================== 账套 ====================
const tLoading = ref(false)
const tenants = ref<any[]>([])

function startPeriod(row: any): string {
  if (!row?.startYear) return '-'
  return `${row.startYear}-${String(row.startMonth ?? 1).padStart(2, '0')}`
}

async function loadTenants() {
  tLoading.value = true
  try {
    const res: any = await tenantAllList()
    tenants.value = Array.isArray(res) ? res : res?.list ?? []
  } catch {
    /* 拦截器已提示 */
  } finally {
    tLoading.value = false
  }
}

// ---------- 新建账套 ----------
const tenantDlgVisible = ref(false)
const tenantSaving = ref(false)
const tenantFormRef = ref<FormInstance>()
const tenantForm = reactive({ name: '', startYear: new Date().getFullYear(), startMonth: 1, taxNo: '', address: '', legalRep: '' })
const tenantRules: FormRules = {
  name: [{ required: true, message: '请输入账套名称', trigger: 'blur' }],
  startYear: [{ required: true, message: '请填写起始年份', trigger: 'blur' }],
  startMonth: [{ required: true, message: '请选择起始月份', trigger: 'change' }],
}

function openTenantDlg() {
  Object.assign(tenantForm, { name: '', startYear: new Date().getFullYear(), startMonth: 1, taxNo: '', address: '', legalRep: '' })
  tenantDlgVisible.value = true
}

async function submitTenant() {
  await tenantFormRef.value?.validate().catch(() => Promise.reject())
  tenantSaving.value = true
  try {
    await tenantCreate({
      name: tenantForm.name.trim(),
      startYear: Number(tenantForm.startYear),
      startMonth: Number(tenantForm.startMonth),
      taxNo: tenantForm.taxNo.trim() || undefined,
      address: tenantForm.address.trim() || undefined,
      legalRep: tenantForm.legalRep.trim() || undefined,
    })
    ElMessage.success('账套创建成功')
    tenantDlgVisible.value = false
    loadTenants()
  } catch {
    /* 拦截器已提示 */
  } finally {
    tenantSaving.value = false
  }
}

onMounted(() => {
  loadUsers()
  loadOptions()
  loadTenants()
})
</script>

<style scoped>
.users-page { display: flex; flex-direction: column; gap: 18px; }
.users-tabs { padding: 0 24px; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
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
.users-tabs :deep(.el-tabs__item.is-active) .tab-count {
  background: var(--fm-gradient-hero);
  color: #fff;
}

.muted { color: var(--fm-text-3); }
.num-mono { font-family: var(--fm-font-num); font-variant-numeric: tabular-nums; }

.user-cell { display: flex; align-items: center; gap: 10px; }
.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--fm-gradient-hero);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px -2px rgba(79,70,229,0.4);
  flex-shrink: 0;
}
.user-name { font-size: 13px; font-weight: 600; color: var(--fm-text-1); }
.user-real { font-size: 11px; color: var(--fm-text-3); margin-top: 1px; }

.tag-cluster { display: flex; flex-wrap: wrap; gap: 4px; }
.role-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
  background: rgba(99,102,241,0.10);
  color: var(--fm-brand-600);
}
html.dark .role-pill { color: var(--fm-brand-300); }
.tenant-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
  border: 1px solid var(--fm-border-soft);
}
.tenant-pill.is-default {
  background: var(--fm-success-soft);
  color: var(--fm-success-ink);
  border-color: transparent;
}
.default-mark { font-size: 10px; opacity: 0.7; }

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
.status-pill.pill-danger  { background: var(--fm-danger-soft);  color: var(--fm-danger-ink); }

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
.action-btn.warn:hover { color: var(--fm-warning); border-color: rgba(245,158,11,0.4); background: var(--fm-warning-soft); }

.pager { padding: 14px 20px; display: flex; justify-content: flex-end; border-top: 1px solid var(--fm-border-soft); }

.filter-tip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--fm-text-3); }
.text-brand { color: var(--fm-brand-600); }

.tenant-icon { color: var(--fm-brand-500); margin-right: 4px; vertical-align: -2px; }
.period-pill {
  display: inline-block;
  font-family: var(--fm-font-num);
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: var(--fm-radius-pill);
  background: var(--fm-bg-muted);
  color: var(--fm-text-2);
}

.status-pill.pill-info { background: rgba(148,163,184,0.15); color: var(--fm-text-2); }
</style>
