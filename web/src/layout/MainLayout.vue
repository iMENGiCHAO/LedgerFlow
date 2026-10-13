<template>
  <el-container class="layout">
    <!-- ==================== 桌面侧栏 ==================== -->
    <el-aside v-if="!isMobile" :width="collapsed ? '76px' : '244px'" class="aside fm-no-print">
      <div class="logo" @click="$router.push('/dashboard')">
        <div class="logo-mark">
          <span class="logo-mark-text">财</span>
          <span class="logo-mark-pulse" />
        </div>
        <transition name="fm-fade">
          <div v-if="!collapsed" class="logo-text">
            <div class="logo-title">智云 · 财务</div>
            <div class="logo-sub">{{ auth.currentTenantName || '未选择账套' }}</div>
          </div>
        </transition>
        <button v-if="!collapsed" class="logo-collapse" @click.stop="collapsed = true" title="收起侧栏">
          <el-icon :size="14"><Fold /></el-icon>
        </button>
      </div>

      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="activeMenu"
          :collapse="collapsed"
          :collapse-transition="false"
          router
          class="menu"
        >
          <template v-for="group in visibleGroups" :key="group.label">
            <div v-if="!collapsed" class="menu-group-label">{{ group.label }}</div>
            <template v-for="item in group.items" :key="item.title">
              <el-menu-item v-if="!item.children" :index="item.path">
                <el-icon><component :is="item.icon" /></el-icon>
                <template #title>
                  <span class="menu-label">{{ item.title }}</span>
                </template>
              </el-menu-item>
              <el-sub-menu v-else :index="item.title">
                <template #title>
                  <el-icon><component :is="item.icon" /></el-icon>
                  <span class="menu-label">{{ item.title }}</span>
                </template>
                <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
                  <el-icon class="sub-bullet"><CircleCheck v-if="activeMenu === child.path" /><CirclePlus v-else /></el-icon>
                  <template #title>{{ child.title }}</template>
                </el-menu-item>
              </el-sub-menu>
            </template>
          </template>
        </el-menu>
      </el-scrollbar>

      <div v-if="collapsed" class="aside-foot-collapsed">
        <button class="icon-btn" @click="collapsed = false" title="展开侧栏">
          <el-icon :size="16"><Expand /></el-icon>
        </button>
      </div>
    </el-aside>

    <!-- ==================== 右侧区域 ==================== -->
    <el-container class="right">
      <el-header height="64px" class="header fm-no-print">
        <!-- 移动端汉堡按钮 -->
        <el-button v-if="isMobile" text class="hamburger" @click="drawerOpen = true">
          <el-icon :size="20"><Expand /></el-icon>
        </el-button>

        <!-- 桌面折叠按钮 -->
        <button v-else class="fold-btn" @click="collapsed = !collapsed" :title="collapsed ? '展开侧栏' : '收起侧栏'">
          <el-icon :size="18"><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </button>

        <!-- 面包屑(桌面)/ 页面标题(移动) -->
        <el-breadcrumb v-if="!isMobile" separator="/" class="crumb">
          <el-breadcrumb-item :to="{ path: '/dashboard' }">
            <el-icon :size="13" class="crumb-home"><HomeFilled /></el-icon>
            <span style="margin-left: 4px">首页</span>
          </el-breadcrumb-item>
          <el-breadcrumb-item v-if="$route.meta.group">{{ $route.meta.group }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ $route.meta.title }}</el-breadcrumb-item>
        </el-breadcrumb>
        <span v-else class="mobile-title">{{ $route.meta.title }}</span>

        <div class="header-right">
          <el-select
            v-if="!isMobile"
            :model-value="auth.currentTenantId"
            class="tenant-select"
            size="default"
            @change="onSwitchTenant"
          >
            <template #prefix>
              <el-icon :size="14" style="margin-right: 4px"><OfficeBuilding /></el-icon>
            </template>
            <el-option v-for="t in auth.tenants" :key="t.id" :label="t.name" :value="String(t.id)" />
          </el-select>

          <ThemeToggle />

          <el-dropdown trigger="click" @command="onUserCommand">
            <div class="user-entry">
              <div class="avatar">{{ avatarChar }}</div>
              <div v-if="!isMobile" class="user-meta">
                <div class="user-name">{{ auth.realName }}</div>
                <div class="user-role">{{ roleLabel }}</div>
              </div>
              <el-icon class="user-arrow"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">
                  <el-icon><Lock /></el-icon> 修改密码
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon> 退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view v-slot="{ Component, route }">
          <transition name="fm-fade" mode="out-in">
            <div :key="route.path" class="route-wrap">
              <component :is="Component" />
            </div>
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <!-- ==================== 移动端抽屉菜单 ==================== -->
    <el-drawer v-model="drawerOpen" direction="ltr" size="280px" :with-header="false" class="fm-drawer">
      <div class="drawer-inner">
        <div class="logo">
          <div class="logo-mark">
            <span class="logo-mark-text">财</span>
          </div>
          <div class="logo-text">
            <div class="logo-title">智云 · 财务</div>
            <div class="logo-sub">{{ auth.currentTenantName || '未选择账套' }}</div>
          </div>
        </div>

        <el-scrollbar class="menu-scroll">
          <el-menu
            :default-active="activeMenu"
            router
            class="menu"
            @select="() => (drawerOpen = false)"
          >
            <template v-for="group in visibleGroups" :key="group.label">
              <div class="menu-group-label">{{ group.label }}</div>
              <template v-for="item in group.items" :key="item.title">
                <el-menu-item v-if="!item.children" :index="item.path">
                  <el-icon><component :is="item.icon" /></el-icon>
                  <template #title>{{ item.title }}</template>
                </el-menu-item>
                <el-sub-menu v-else :index="item.title">
                  <template #title>
                    <el-icon><component :is="item.icon" /></el-icon>
                    <span>{{ item.title }}</span>
                  </template>
                  <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
                    {{ child.title }}
                  </el-menu-item>
                </el-sub-menu>
              </template>
            </template>
          </el-menu>
        </el-scrollbar>

        <div class="drawer-foot">
          <div class="drawer-foot-label">当前账套</div>
          <el-select
            :model-value="auth.currentTenantId"
            size="small"
            class="drawer-tenant"
            @change="onSwitchTenant"
          >
            <el-option v-for="t in auth.tenants" :key="t.id" :label="t.name" :value="String(t.id)" />
          </el-select>
        </div>
      </div>
    </el-drawer>

    <!-- 修改密码 -->
    <el-dialog v-model="pwdVisible" title="修改密码" width="min(92vw, 440px)" destroy-on-close>
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="90px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password autocomplete="off" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password autocomplete="off" placeholder="至少6位" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm">
          <el-input v-model="pwdForm.confirm" type="password" show-password autocomplete="off" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSaving" @click="doChangePwd">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import {
  Odometer, Setting, DocumentChecked, Notebook, Calendar,
  DataLine, TrendCharts, Coin, Tickets, Wallet, Money,
  Finished, Box, Tools, ArrowDown, Fold, Expand, HomeFilled,
  Lock, SwitchButton, OfficeBuilding, CircleCheck, CirclePlus, Reading,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { changePassword, switchTenant } from '@/api/modules'
import ThemeToggle from '@/components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// ---------- 响应式状态 ----------
const isMobile = ref(window.innerWidth < 1024)
const drawerOpen = ref(false)
const collapsed = ref(false)
let mq: MediaQueryList | null = null

function onMqChange(e: MediaQueryListEvent) {
  isMobile.value = e.matches
}

onMounted(() => {
  mq = window.matchMedia('(max-width: 1023px)')
  isMobile.value = mq.matches
  mq.addEventListener('change', onMqChange)
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMqChange)
})

watch(
  () => route.path,
  () => {
    drawerOpen.value = false
  },
)

// ---------- 菜单配置 ----------
interface MenuChild { path: string; title: string; perm?: string[] }
interface MenuItem { title: string; icon: unknown; path?: string; perm?: string[]; children?: MenuChild[] }
interface MenuGroup { label: string; items: MenuItem[] }

const MENU_GROUPS: MenuGroup[] = [
  {
    label: '总览',
    items: [{ title: '经营看板', icon: Odometer, path: '/dashboard', perm: ['dashboard:view'] }],
  },
  {
    label: '基础数据',
    items: [
      {
        title: '基础设置',
        icon: Setting,
        perm: ['md:manage'],
        children: [
          { path: '/base/subjects', title: '科目管理' },
          { path: '/base/partners', title: '往来单位' },
          { path: '/base/org', title: '部门项目员工' },
        ],
      },
      { title: '期初建账', icon: DocumentChecked, path: '/init-balances', perm: ['ledger:init'] },
    ],
  },
  {
    label: '日常业务',
    items: [
      {
        title: '凭证管理',
        icon: Notebook,
        perm: ['voucher:create', 'voucher:audit', 'ledger:view'],
        children: [
          { path: '/vouchers', title: '凭证列表', perm: ['ledger:view'] },
          { path: '/vouchers/new', title: '录入凭证', perm: ['voucher:create'] },
        ],
      },
      { title: '应收应付', icon: Coin, path: '/arap', perm: ['arap:manage'] },
      { title: '发票台账', icon: Tickets, path: '/invoices', perm: ['invoice:manage'] },
      { title: '资金管理', icon: Wallet, path: '/fund', perm: ['fund:manage'] },
      { title: '固定资产', icon: Box, path: '/assets', perm: ['asset:manage'] },
    ],
  },
  {
    label: '报表中心',
    items: [
      { title: '期末处理', icon: Calendar, path: '/closing', perm: ['closing:execute', 'asset:manage'] },
      {
        title: '账簿报表',
        icon: DataLine,
        perm: ['ledger:view'],
        children: [
          { path: '/reports/balance-summary', title: '科目余额表' },
          { path: '/reports/detail-ledger', title: '明细账' },
        ],
      },
      {
        title: '财务报表',
        icon: TrendCharts,
        perm: ['report:view'],
        children: [
          { path: '/reports/balance-sheet', title: '资产负债表' },
          { path: '/reports/income', title: '利润表' },
        ],
      },
    ],
  },
  {
    label: '协同办公',
    items: [
      { title: '我的报销', icon: Money, path: '/expense/mine', perm: ['expense:create'] },
      { title: '报销审批', icon: Finished, path: '/expense/approve', perm: ['expense:approve', 'expense:pay'] },
    ],
  },
  {
    label: '系统管理',
    items: [
      {
        title: '系统管理',
        icon: Tools,
        children: [
          { path: '/system/users', title: '用户管理', perm: ['system:user'] },
          { path: '/system/roles', title: '角色权限', perm: ['system:role'] },
          { path: '/system/logs', title: '操作日志', perm: ['system:log'] },
          { path: '/system/backups', title: '数据备份', perm: ['system:backup'] },
          { path: '/system/tenants', title: '账套管理', perm: ['system:user', 'md:manage'] },
          { path: '/system/health', title: '健康检查', perm: ['voucher:create', 'md:manage', 'expense:create'] },
        ],
      },
      { title: '使用说明', icon: Reading, path: '/help' },
    ],
  },
]

const visibleGroups = computed(() =>
  MENU_GROUPS.map((g) => {
    const items = g.items
      .map((m) => {
        if (!auth.hasPerm(m.perm)) return null
        if (!m.children) return m
        const children = m.children.filter((c) => auth.hasPerm(c.perm))
        return children.length ? { ...m, children } : null
      })
      .filter(Boolean) as MenuItem[]
    return { label: g.label, items }
  }).filter((g) => g.items.length > 0),
)

const activeMenu = computed(() => '/' + route.path.split('/')[1])
const avatarChar = computed(() => (auth.realName || '?').slice(0, 1))
const roleLabel = computed(() => {
  if (auth.isSuper) return '系统管理员'
  if (auth.hasPerm('report:view')) return '财务主管'
  if (auth.hasPerm('voucher:audit')) return '会计'
  if (auth.hasPerm('expense:pay')) return '出纳'
  if (auth.hasPerm('dashboard:view')) return '总经理'
  return '员工'
})

// ---------- 账套切换 ----------
async function onSwitchTenant(tenantId: string) {
  try {
    await ElMessageBox.confirm('切换账套后页面将重新加载,是否继续?', '切换账套', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res: any = await switchTenant(tenantId)
    auth.setAuth(res)
    location.reload()
  } catch {
    /* 拦截器已提示 */
  }
}

// ---------- 用户下拉 ----------
async function onUserCommand(cmd: string) {
  if (cmd === 'logout') {
    try {
      await ElMessageBox.confirm('确定退出登录吗?退出后 token 将立即失效', '提示', { type: 'warning' })
    } catch {
      return
    }
    await auth.logout()  // 调后端 revoke
    router.push('/login')
  } else if (cmd === 'password') {
    pwdVisible.value = true
  }
}

// ---------- 修改密码 ----------
const pwdVisible = ref(false)
const pwdSaving = ref(false)
const pwdFormRef = ref<FormInstance>()
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '至少6位', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_r, v, cb) => (v === pwdForm.newPassword ? cb() : cb(new Error('两次输入不一致'))),
      trigger: 'blur',
    },
  ],
}

async function doChangePwd() {
  await pwdFormRef.value?.validate().catch(() => Promise.reject())
  pwdSaving.value = true
  try {
    await changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword })
    ElMessage.success('密码修改成功')
    pwdVisible.value = false
    pwdForm.oldPassword = pwdForm.newPassword = pwdForm.confirm = ''
  } catch {
    /* 拦截器已提示 */
  } finally {
    pwdSaving.value = false
  }
}
</script>

<style scoped>
.layout {
  height: 100vh;
  background: var(--fm-bg-page);
}

/* ---------- 侧栏(毛玻璃浅色) ---------- */
.aside {
  display: flex;
  flex-direction: column;
  background: var(--fm-bg-elevated);
  border-right: 1px solid var(--fm-border-soft);
  transition: width var(--fm-dur-base) var(--fm-ease);
  overflow: hidden;
  box-shadow: 1px 0 0 var(--fm-border-soft);
  position: relative;
}
.aside::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg,
    rgba(99,102,241,0.04) 0%,
    transparent 30%,
    transparent 70%,
    rgba(139,92,246,0.04) 100%);
  pointer-events: none;
  z-index: 0;
}
html.dark .aside {
  background: var(--fm-bg-elevated);
  border-right-color: var(--fm-border);
}
html.dark .aside::before {
  background: linear-gradient(180deg,
    rgba(99,102,241,0.08) 0%,
    transparent 30%,
    transparent 70%,
    rgba(139,92,246,0.08) 100%);
}

.logo {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px;
  border-bottom: 1px solid var(--fm-border-soft);
  cursor: pointer;
  min-height: 72px;
  transition: background var(--fm-dur-base) var(--fm-ease);
}
.logo:hover { background: var(--fm-bg-muted); }

.logo-mark {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--fm-gradient-hero);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 6px 18px -6px rgba(79,70,229,0.55);
  overflow: hidden;
}
.logo-mark-text {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
  position: relative;
  z-index: 1;
}
.logo-mark-pulse {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 50%);
}

.logo-text { min-width: 0; flex: 1; }
.logo-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--fm-text-1);
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, var(--fm-text-1) 0%, var(--fm-brand-600) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.logo-sub {
  margin-top: 3px;
  font-size: 11px;
  color: var(--fm-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.logo-collapse {
  width: 22px;
  height: 22px;
  border: 1px solid var(--fm-border);
  background: var(--fm-bg-elevated);
  color: var(--fm-text-3);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--fm-dur-base) var(--fm-ease);
}
.logo-collapse:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); }

.menu-scroll {
  flex: 1;
  padding: 12px 8px 12px;
  position: relative;
  z-index: 1;
}
.menu {
  border-right: none;
  background: transparent;
}
.menu :deep(.el-menu-item),
.menu :deep(.el-sub-menu__title) {
  margin: 2px 0;
  border-radius: var(--fm-radius-sm);
  height: 42px;
  line-height: 42px;
  color: var(--fm-text-2);
  font-weight: 500;
  transition: all var(--fm-dur-base) var(--fm-ease);
}
.menu :deep(.el-menu-item .el-icon),
.menu :deep(.el-sub-menu__title .el-icon) {
  font-size: 17px;
  color: var(--fm-text-3);
  transition: color var(--fm-dur-base) var(--fm-ease);
  margin-right: 12px;
}
.menu :deep(.el-menu-item:hover),
.menu :deep(.el-sub-menu__title:hover) {
  background: rgba(99,102,241,0.06);
  color: var(--fm-brand-600);
}
.menu :deep(.el-menu-item:hover .el-icon),
.menu :deep(.el-sub-menu__title:hover .el-icon) { color: var(--fm-brand-600); }

.menu :deep(.el-menu-item.is-active) {
  position: relative;
  background: var(--fm-gradient-brand-soft);
  color: var(--fm-brand-600);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(99,102,241,0.2);
}
.menu :deep(.el-menu-item.is-active) .el-icon { color: var(--fm-brand-600); }
.menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--fm-gradient-hero);
  box-shadow: 0 0 8px rgba(79,70,229,0.5);
}
.menu-label { letter-spacing: 0.01em; }

/* 二级菜单 */
.menu :deep(.el-menu .el-menu-item) {
  background: transparent;
  padding-left: 48px !important;
  min-width: 0;
  height: 38px;
  line-height: 38px;
}
.menu :deep(.el-menu .el-menu-item .sub-bullet) {
  margin-right: 8px;
  font-size: 6px;
  color: var(--fm-text-3);
}
.menu :deep(.el-menu .el-menu-item.is-active .sub-bullet) { color: var(--fm-brand-500); }

.menu-group-label {
  padding: 16px 16px 8px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fm-text-3);
  font-weight: 600;
  user-select: none;
  white-space: nowrap;
}
.menu-group-label:first-child { padding-top: 8px; }

.aside-foot-collapsed {
  position: relative;
  z-index: 1;
  padding: 12px;
  border-top: 1px solid var(--fm-border-soft);
  display: flex;
  justify-content: center;
}
.icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--fm-border);
  background: var(--fm-bg-elevated);
  color: var(--fm-text-2);
  border-radius: var(--fm-radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--fm-dur-base) var(--fm-ease);
}
.icon-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); transform: translateY(-1px); box-shadow: var(--fm-shadow-sm); }

/* ---------- 顶栏(毛玻璃) ---------- */
.right {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 24px;
  background: var(--fm-glass-bg);
  backdrop-filter: var(--fm-glass-blur);
  -webkit-backdrop-filter: var(--fm-glass-blur);
  border-bottom: 1px solid var(--fm-border-soft);
  z-index: 5;
  position: relative;
}

.hamburger,
.fold-btn {
  color: var(--fm-text-2);
  padding: 8px;
  width: 36px;
  height: 36px;
  border-radius: var(--fm-radius-sm);
  border: 1px solid var(--fm-border);
  background: var(--fm-bg-elevated);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--fm-dur-base) var(--fm-ease);
}
.fold-btn:hover { color: var(--fm-brand-600); border-color: var(--fm-brand-300); transform: translateY(-1px); box-shadow: var(--fm-shadow-sm); }
.hamburger { border: none; background: transparent; }

.crumb {
  font-size: 13px;
  flex: 1;
  min-width: 0;
}
.crumb :deep(.el-breadcrumb__item__inner) { color: var(--fm-text-3); font-weight: 400; }
.crumb :deep(.el-breadcrumb__item:last-child .el-breadcrumb__item__inner) { color: var(--fm-text-1); font-weight: 600; }
.crumb-home { vertical-align: -2px; }

.mobile-title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--fm-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.tenant-select {
  width: 200px;
}
.tenant-select :deep(.el-select__wrapper) {
  background: var(--fm-bg-elevated);
  box-shadow: 0 0 0 1px var(--fm-border) inset;
}

.user-entry {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 4px 4px;
  border-radius: var(--fm-radius-pill);
  cursor: pointer;
  outline: none;
  border: 1px solid transparent;
  transition: all var(--fm-dur-base) var(--fm-ease);
}
.user-entry:hover {
  background: var(--fm-bg-muted);
  border-color: var(--fm-border-soft);
}
.avatar {
  width: 32px;
  height: 32px;
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
.user-meta { line-height: 1.2; text-align: left; }
.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--fm-text-1);
}
.user-role {
  font-size: 11px;
  color: var(--fm-text-3);
  margin-top: 1px;
}
.user-arrow { font-size: 11px; color: var(--fm-text-3); }

/* ---------- 主内容 ---------- */
.main {
  padding: 24px 28px 32px;
  overflow: auto;
  background: var(--fm-bg-page);
}
.route-wrap { animation: fmPageIn 0.4s var(--fm-ease-out); }

@media (max-width: 1023px) {
  .main { padding: 16px; }
}
@media (min-width: 1440px) {
  .main { padding: 28px 40px 40px; }
}
@media (max-width: 767px) {
  .header { padding: 0 14px; gap: 8px; }
  .user-meta { display: none; }
  .tenant-select { display: none; }
}

/* ---------- 抽屉 ---------- */
.drawer-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--fm-bg-elevated);
}
.drawer-foot {
  padding: 14px;
  border-top: 1px solid var(--fm-border-soft);
}
.drawer-foot-label {
  font-size: 11px;
  color: var(--fm-text-3);
  margin-bottom: 6px;
}
.drawer-tenant { width: 100%; }
</style>

<style>
/* 抽屉体去内边距 */
.fm-drawer .el-drawer__body,
.el-drawer__body:has(> .drawer-inner),
.el-drawer:has(> .drawer-inner) .el-drawer__body {
  padding: 0;
}
</style>
