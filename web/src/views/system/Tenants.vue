<template>
  <div class="tenants-page">
    <PageHeader title="账套管理" subtitle="企业基本信息、启用期间、所属账套列表——支持多个公司切换" icon="OfficeBuilding">
      <template #actions>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
      </template>
    </PageHeader>

    <!-- 当前账套的企业信息(企业抬头) -->
    <SectionCard title="当前账套 · 企业信息" icon="Shop" v-if="current">
      <el-form :model="currentForm" :rules="rules" ref="formRef" label-width="120px" class="tenant-form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="公司名称" prop="name">
              <el-input v-model="currentForm.name" placeholder="如:北京小明科技有限公司" maxlength="80" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="税号" prop="taxNo">
              <el-input v-model="currentForm.taxNo" placeholder="统一社会信用代码(18位)" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="法人代表">
              <el-input v-model="currentForm.legalRep" placeholder="姓名" maxlength="30" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="注册地址">
              <el-input v-model="currentForm.address" placeholder="用于发票打印" maxlength="120" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用年份" :error="periodError">
              <el-input-number v-model="currentForm.startYear" :min="2000" :max="2099" :step="1" :disabled="current.status === 1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="启用月份" :error="periodError">
              <el-input-number v-model="currentForm.startMonth" :min="1" :max="12" :step="1" :disabled="current.status === 1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col v-if="current.status === 1" :span="24">
            <el-alert type="info" :closable="false" show-icon title="账套已启用" description="启用期间(startYear/startMonth)已锁定,仅可修改公司基本信息。如需调整启用期间,请先「反启用」(后续版本提供)。" />
          </el-col>
        </el-row>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveCurrent">保存企业信息</el-button>
          <el-button @click="loadCurrent">取消</el-button>
        </el-form-item>
      </el-form>

      <div class="tenant-stats">
        <div class="stat">
          <div class="num">{{ current.stats?.vouchers || 0 }}</div>
          <div class="lbl">凭证数</div>
        </div>
        <div class="stat">
          <div class="num">{{ current.stats?.subjects || 0 }}</div>
          <div class="lbl">科目数</div>
        </div>
        <div class="stat">
          <div class="num">{{ current.stats?.partners || 0 }}</div>
          <div class="lbl">往来单位</div>
        </div>
        <div class="stat">
          <div class="num">{{ current.stats?.userTenants || 0 }}</div>
          <div class="lbl">授权用户</div>
        </div>
      </div>
    </SectionCard>

    <!-- 我可访问的所有账套 -->
    <SectionCard title="我的账套" icon="Folder">
      <template #actions>
        <el-button type="primary" :icon="Plus" size="small" @click="openCreate" v-if="auth.user?.isSuper">新建账套</el-button>
      </template>
      <el-table :data="list" border>
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="name" label="公司名称" min-width="200" />
        <el-table-column label="启用期间" width="140">
          <template #default="{ row }">
            {{ row.startYear }}-{{ String(row.startMonth).padStart(2,'0') }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tooltip placement="top" effect="dark" :show-after="200">
              <template #content>
                {{ row.status === 1 ? '账套已启用,期间锁定,需先停用才能改期间' : '账套未启用(期初录入中),期间可改,点「启用」前必须先到「期初建账」录入并借贷平衡' }}
              </template>
              <el-tag :type="row.status === 1 ? 'success' : 'warning'" size="small">
                <el-icon v-if="row.status === 1" style="vertical-align: middle"><CircleCheck /></el-icon>
                <el-icon v-else style="vertical-align: middle"><Warning /></el-icon>
                {{ row.status === 1 ? '已启用' : '未启用' }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="凭证数" width="100" align="right">
          <template #default="{ row }">
            <el-tag v-if="row._count?.vouchers" type="info" size="small">{{ row._count?.vouchers || 0 }}</el-tag>
            <span v-else style="color: var(--fm-text-muted, #94a3b8)">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="360" align="right" fixed="right">
          <template #default="{ row }">
            <el-tooltip placement="top" effect="dark" content="修改公司名/税号/地址/法人" :show-after="200">
              <button class="action-btn" :disabled="!canEdit(row)" @click="openEdit(row)">编辑</button>
            </el-tooltip>
            <el-tooltip placement="top" effect="dark" content="切换到该账套工作" :show-after="200">
              <button class="action-btn success" :disabled="row.id === current?.id" @click="switchTo(row)">切换</button>
            </el-tooltip>
            <el-tooltip placement="top" effect="dark" :content="row.status === 1 ? '停用账套(期间会解锁)' : '启用账套(需先录期初)'" :show-after="200">
              <button class="action-btn" :class="row.status === 1 ? 'warn' : 'primary'" :disabled="!canEdit(row)" @click="row.status === 1 ? deactivate(row) : activate(row)">
                {{ row.status === 1 ? '停用' : '启用' }}
              </button>
            </el-tooltip>
            <el-tooltip placement="top" effect="dark" content="删除账套(需停用且无业务数据)" :show-after="200">
              <button class="action-btn danger" :disabled="!canSuperDel(row)" @click="remove(row)">删除</button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!list.length" class="empty-tip">
        <el-empty description="暂无可访问的账套" :image-size="60" />
      </div>
    </SectionCard>

    <!-- 编辑 dialog -->
    <el-dialog v-model="dlgVisible" :title="editingId ? '编辑账套' : '创建账套'" width="min(92vw, 640px)" destroy-on-close>
      <el-form :model="dlgForm" :rules="dlgRules" ref="dlgFormRef" label-width="120px">
        <el-form-item label="公司名称" prop="name">
          <el-input v-model="dlgForm.name" placeholder="公司全称" maxlength="80" />
        </el-form-item>
        <el-form-item label="税号" prop="taxNo">
          <el-input v-model="dlgForm.taxNo" placeholder="统一社会信用代码" maxlength="20" />
        </el-form-item>
        <el-form-item label="法人代表">
          <el-input v-model="dlgForm.legalRep" maxlength="30" />
        </el-form-item>
        <el-form-item label="注册地址">
          <el-input v-model="dlgForm.address" maxlength="120" />
        </el-form-item>
        <el-form-item label="启用期间" v-if="!editingId">
          <el-input-number v-model="dlgForm.startYear" :min="2000" :max="2099" style="width: 100px" />
          <span style="margin: 0 6px">年</span>
          <el-input-number v-model="dlgForm.startMonth" :min="1" :max="12" style="width: 80px" />
          <span style="margin-left: 6px">月(账套创建后启用期间不可改)</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDlg">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Refresh, OfficeBuilding, Shop, Folder, Plus, CircleCheck, Warning } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import { useAuthStore } from '@/stores/auth'
import {
  getCurrentTenant, getMyTenants, updateCurrentTenant,
  createNewTenant, updateAnyTenant, switchToTenantApi,
  activateTenant, deactivateTenant, deleteTenant,
} from '@/api/modules'

const router = useRouter()
const auth = useAuthStore()

const list = ref<any[]>([])
const current = ref<any | null>(null)
const currentForm = reactive({ name: '', taxNo: '', legalRep: '', address: '', startYear: 2026, startMonth: 1 })
const formRef = ref<FormInstance>()
const saving = ref(false)
const periodError = ref('')

const dlgVisible = ref(false)
const editingId = ref<number | null>(null)
const dlgForm = reactive({ name: '', taxNo: '', legalRep: '', address: '', startYear: 2026, startMonth: 1 })
const dlgFormRef = ref<FormInstance>()

const rules: FormRules = {
  name: [{ required: true, message: '公司名称必填', trigger: 'blur' }],
  taxNo: [{ pattern: /^[0-9A-Z]{15,20}$/i, message: '税号格式不正确(15-20位字母数字)', trigger: 'blur' }],
}
const dlgRules: FormRules = { ...rules }

function canEdit(row: any) {
  if (auth.user?.isSuper) return true
  return auth.user?.perms?.includes('system:user') || false
}

async function loadCurrent() {
  try {
    const d: any = await getCurrentTenant()
    current.value = d
    Object.assign(currentForm, {
      name: d.name || '',
      taxNo: d.taxNo || '',
      legalRep: d.legalRep || '',
      address: d.address || '',
      startYear: d.startYear,
      startMonth: d.startMonth,
    })
    periodError.value = ''
  } catch {
    /* 拦截器已提示 */
  }
}

async function loadList() {
  try {
    list.value = await getMyTenants() as any[]
  } catch {
    /* 拦截器已提示 */
  }
}

function loadAll() {
  loadCurrent()
  loadList()
}

async function saveCurrent() {
  // 表单校验:失败时直接 return,不要吞错(silent fail 是大坑)
  const valid = await formRef.value?.validate().catch(() => false) as boolean
  if (!valid) {
    ElMessage.warning('请检查必填项/格式')
    return
  }
  if (current.value?.status === 1) {
    // 已启用:期间不可改
    if (currentForm.startYear !== current.value.startYear || currentForm.startMonth !== current.value.startMonth) {
      periodError.value = '账套已启用,期间不能修改'
      ElMessage.warning(periodError.value)
      return
    }
  }
  saving.value = true
  try {
    await updateCurrentTenant({
      name: currentForm.name.trim(),
      taxNo: currentForm.taxNo.trim() || null,
      legalRep: currentForm.legalRep.trim() || null,
      address: currentForm.address.trim() || null,
      startYear: currentForm.startYear,
      startMonth: currentForm.startMonth,
    })
    ElMessage.success('企业信息已保存')
    loadAll()
  } catch (err: any) {
    // 拦截器已弹过 ElMessage.error,这里只 log
    console.error('[saveCurrent] failed', err)
  } finally {
    saving.value = false
  }
}

function openEdit(row: any) {
  editingId.value = row.id
  Object.assign(dlgForm, {
    name: row.name || '',
    taxNo: row.taxNo || '',
    legalRep: row.legalRep || '',
    address: row.address || '',
    startYear: row.startYear,
    startMonth: row.startMonth,
  })
  dlgVisible.value = true
}

async function saveDlg() {
  // 表单校验:失败时显式提示,不要 silent fail
  const valid = await dlgFormRef.value?.validate().catch(() => false) as boolean
  if (!valid) {
    ElMessage.warning('请检查必填项/格式')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateAnyTenant(editingId.value, {
        name: dlgForm.name.trim(),
        taxNo: dlgForm.taxNo.trim() || null,
        legalRep: dlgForm.legalRep.trim() || null,
        address: dlgForm.address.trim() || null,
      })
      ElMessage.success('账套已更新')
    } else {
      // 创建账套由后端处理(超管)
      const r: any = await createNewTenant({
        name: dlgForm.name.trim(),
        taxNo: dlgForm.taxNo.trim() || null,
        legalRep: dlgForm.legalRep.trim() || null,
        address: dlgForm.address.trim() || null,
        startYear: dlgForm.startYear,
        startMonth: dlgForm.startMonth,
      })
      ElMessage.success(`账套已创建 (id=${r?.id})`)
    }
    dlgVisible.value = false
    loadAll()
  } catch {
    /* 拦截器已提示 */
  } finally {
    saving.value = false
  }
}

async function switchTo(row: any) {
  try {
    const r: any = await switchToTenantApi(row.id)
    auth.token = r.accessToken
    auth.currentTenantId = String(row.id)
    localStorage.setItem('fm_token', r.accessToken)
    localStorage.setItem('fm_tenant_id', String(row.id))
    ElMessage.success(`已切换到「${row.name}」`)
    router.go(0)
  } catch {
    /* 拦截器已提示 */
  }
}

function canSuperDel(row: any) {
  // 只有超管可删;已启用不可删;当前账套不可删
  if (!auth.user?.isSuper) return false
  if (row.status === 1) return false
  if (row.id === current.value?.id) return false
  return true
}

async function activate(row: any) {
  // 启用前预检:后端会校验期初平衡,前端先给清晰指引
  if (!row.startYear || !row.startMonth) {
    ElMessage.warning('请先设置账套的启用期间(年/月)')
    return
  }
  try {
    await ElMessageBox.confirm(
      `<div style="line-height: 1.7">
        <p style="margin: 0 0 10px">确定启用「<strong>${row.name}</strong>」吗?</p>
        <p style="margin: 8px 0; color: #f59e0b">⚠️ 启用前必须先完成:</p>
        <ol style="margin: 4px 0; padding-left: 24px; line-height: 1.8">
          <li>到「<strong>期初建账</strong>」录入各末级科目期初余额</li>
          <li>借贷方必须平衡(差额 = 0)才能启用</li>
          <li>启用期间:<strong>${row.startYear}-${String(row.startMonth).padStart(2,'0')}</strong></li>
        </ol>
        <p style="margin: 8px 0 0; color: #64748b; font-size: 12px">没录期初将提示失败,先去「期初建账」再回来点启用。</p>
      </div>`,
      '启用账套',
      {
        type: 'info',
        confirmButtonText: '已录期初,启用',
        cancelButtonText: '取消',
        dangerouslyUseHTMLString: true,
        customClass: 'tenant-activate-dialog',
      },
    )
  } catch { return }
  try {
    await activateTenant(row.id)
    ElMessage.success(`「${row.name}」已启用`)
    loadAll()
  } catch (err: any) {
    // 后端 42004 是期初不平,把错误消息更友好
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('期初')) {
      try {
        await ElMessageBox.alert(
          `<p style="margin: 0 0 10px">${msg}</p>
          <p style="margin: 0">请到 <strong>「期初建账」</strong> 录入末级科目的期初余额,借贷平衡后再来启用。</p>`,
          '启用失败 · 期初未平衡',
          { type: 'warning', confirmButtonText: '我知道了', dangerouslyUseHTMLString: true },
        )
      } catch { /* 用户关掉 */ }
    } else if (msg) {
      ElMessage.error(msg)
    }
  }
}

async function deactivate(row: any) {
  try {
    await ElMessageBox.confirm(
      `确定停用「${row.name}」吗?\n\n停用后:\n- 期间会被解锁,公司信息和启用期间可重新调整\n- 已有数据保留不删\n- 用户无法再切换到该账套(需先重新启用)`,
      '停用账套',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' },
    )
  } catch { return }
  try {
    await deactivateTenant(row.id)
    ElMessage.success(`「${row.name}」已停用`)
    loadAll()
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message
    if (msg) ElMessage.error(msg)
  }
}

async function remove(row: any) {
  try {
    await ElMessageBox.confirm(
      `<div style="line-height: 1.7">
        <p style="margin: 0 0 10px; color: #ef4444; font-weight: 600">⚠️ 永久删除「${row.name}」,不可恢复!</p>
        <p style="margin: 8px 0">该操作会:</p>
        <ul style="margin: 4px 0; padding-left: 24px; line-height: 1.8">
          <li>要求账套已<strong>停用</strong></li>
          <li>要求账套下无业务数据(无凭证/科目/往来)</li>
          <li>一并清空该账套的所有用户授权</li>
        </ul>
        <p style="margin: 8px 0 0; color: #64748b; font-size: 12px">如有数据,请先清空或保留账套(改"停用"即可禁用)。</p>
      </div>`,
      '删除账套',
      {
        type: 'error',
        confirmButtonText: '确认永久删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
        dangerouslyUseHTMLString: true,
      },
    )
  } catch { return }
  try {
    await deleteTenant(row.id)
    ElMessage.success(`「${row.name}」已删除`)
    loadAll()
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message
    if (msg) ElMessage.error(msg)
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(dlgForm, {
    name: '', taxNo: '', legalRep: '', address: '',
    startYear: new Date().getFullYear(), startMonth: 1,
  })
  dlgVisible.value = true
}

onMounted(loadAll)
</script>

<style scoped>
.tenants-page { display: flex; flex-direction: column; gap: 16px; }
.tenant-form { max-width: 100%; }
.action-btn.primary { color: var(--fm-brand-600, #4f46e5); }
.action-btn.primary:hover:not(:disabled) { color: #fff; background: var(--fm-brand-600, #4f46e5); border-color: var(--fm-brand-600, #4f46e5); }
.tenant-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 18px;
  padding: 14px;
  background: var(--fm-bg-muted);
  border-radius: 10px;
}
.tenant-stats .stat { text-align: center; }
.tenant-stats .num { font-size: 22px; font-weight: 700; color: var(--fm-brand-600); line-height: 1.2; }
.tenant-stats .lbl { font-size: 12px; color: var(--fm-text-3); margin-top: 2px; }
.empty-tip { padding: 12px 0; }
</style>
