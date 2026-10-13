import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { title: '登录' } },
  {
    path: '/',
    component: () => import('@/layout/MainLayout.vue'),
    redirect: () => {
      // 根路径重定向:按当前用户权限选第一个能进的页
      try {
        const auth = useAuthStore()
        return pickFallbackPath(auth.perms)
      } catch {
        return '/dashboard'
      }
    },
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '经营看板', perm: ['dashboard:view'] } },
      // 基础设置
      { path: 'base/subjects', name: 'subjects', component: () => import('@/views/base/Subjects.vue'), meta: { title: '科目管理', perm: ['md:manage'], group: '基础设置' } },
      { path: 'base/partners', name: 'partners', component: () => import('@/views/base/Partners.vue'), meta: { title: '往来单位', perm: ['md:manage'], group: '基础设置' } },
      { path: 'base/org', name: 'org', component: () => import('@/views/base/OrgData.vue'), meta: { title: '部门项目员工', perm: ['md:manage'], group: '基础设置' } },
      // 期初建账
      { path: 'init-balances', name: 'initBalances', component: () => import('@/views/init/InitialBalances.vue'), meta: { title: '期初建账', perm: ['ledger:init'] } },
      // 凭证管理
      { path: 'vouchers', name: 'voucherList', component: () => import('@/views/voucher/VoucherList.vue'), meta: { title: '凭证列表', perm: ['ledger:view'], group: '凭证管理' } },
      { path: 'vouchers/new', name: 'voucherNew', component: () => import('@/views/voucher/VoucherEdit.vue'), meta: { title: '录入凭证', perm: ['voucher:create'] } },
      { path: 'vouchers/:id/edit', name: 'voucherEdit', component: () => import('@/views/voucher/VoucherEdit.vue'), meta: { title: '修改凭证', perm: ['voucher:create'] } },
      // 期末处理
      { path: 'closing', name: 'closing', component: () => import('@/views/closing/Closing.vue'), meta: { title: '期末处理', perm: ['closing:execute', 'asset:manage'] } },
      // 账簿报表
      { path: 'reports/balance-summary', name: 'balanceSummary', component: () => import('@/views/report/BalanceSummary.vue'), meta: { title: '科目余额表', perm: ['ledger:view'], group: '账簿报表' } },
      { path: 'reports/detail-ledger', name: 'detailLedger', component: () => import('@/views/report/DetailLedger.vue'), meta: { title: '明细账', perm: ['ledger:view'], group: '账簿报表' } },
      // 财务报表
      { path: 'reports/balance-sheet', name: 'balanceSheet', component: () => import('@/views/report/BalanceSheet.vue'), meta: { title: '资产负债表', perm: ['report:view'], group: '财务报表' } },
      { path: 'reports/income', name: 'incomeStatement', component: () => import('@/views/report/IncomeStatement.vue'), meta: { title: '利润表', perm: ['report:view'], group: '财务报表' } },
      // 业务模块
      { path: 'arap', name: 'arap', component: () => import('@/views/arap/ArapBills.vue'), meta: { title: '应收应付', perm: ['arap:manage'] } },
      { path: 'invoices', name: 'invoices', component: () => import('@/views/invoice/InvoiceLedger.vue'), meta: { title: '发票台账', perm: ['invoice:manage'] } },
      { path: 'fund', name: 'fund', component: () => import('@/views/fund/FundManage.vue'), meta: { title: '资金管理', perm: ['fund:manage'] } },
      { path: 'expense/mine', name: 'myClaims', component: () => import('@/views/expense/MyClaims.vue'), meta: { title: '我的报销', perm: ['expense:create'] } },
      { path: 'expense/approve', name: 'claimApprove', component: () => import('@/views/expense/ClaimApprove.vue'), meta: { title: '报销审批', perm: ['expense:approve', 'expense:pay'] } },
      { path: 'assets', name: 'assets', component: () => import('@/views/asset/FixedAssets.vue'), meta: { title: '固定资产', perm: ['asset:manage'] } },
      // 系统管理
      { path: 'system/users', name: 'users', component: () => import('@/views/system/Users.vue'), meta: { title: '用户管理', perm: ['system:user'], group: '系统管理' } },
      { path: 'system/roles', name: 'roles', component: () => import('@/views/system/Roles.vue'), meta: { title: '角色权限', perm: ['system:role'], group: '系统管理' } },
      { path: 'system/logs', name: 'logs', component: () => import('@/views/system/Logs.vue'), meta: { title: '操作日志', perm: ['system:log'], group: '系统管理' } },
      { path: 'system/backups', name: 'backups', component: () => import('@/views/system/Backups.vue'), meta: { title: '数据备份', perm: ['system:backup'], group: '系统管理' } },
      { path: 'system/params', name: 'params', component: () => import('@/views/system/Params.vue'), meta: { title: '系统参数', perm: ['system:user', 'md:manage'], group: '系统管理' } },
      { path: 'system/tenants', name: 'tenants', component: () => import('@/views/system/Tenants.vue'), meta: { title: '账套管理', perm: ['system:user', 'md:manage'], group: '系统管理' } },
      { path: 'system/health', name: 'health', component: () => import('@/views/system/Health.vue'), meta: { title: '健康检查', perm: ['voucher:create', 'md:manage', 'expense:create'], group: '系统管理' } },
      { path: 'help', name: 'help', component: () => import('@/views/help/Help.vue'), meta: { title: '使用说明', group: '系统管理' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

/** 路由级 perm 拒绝提示去重缓存(同一 path 800ms 内只弹一次) */
const routerWarnCache = new Map<string, number>()

/** 找出当前用户第一个能进的菜单路径,用于 perm 失败时的回退 */
function pickFallbackPath(perms: string[]): string {
  // 优先级排序的 fallback 路径(普通员工 > 出纳 > 会计 > CFO/总经理)
  // 注意:每条 fallback 自己也是路由,会被 beforeEach 拦截 — 所以这里挑的路径
  // 必须保证该用户一定有 perm(否则死循环)
  const fallbacks = [
    { path: '/expense/mine', need: ['expense:create'] },                    // 任何登录用户(员工唯一入口)
    { path: '/vouchers', need: ['ledger:view', 'voucher:create', 'voucher:audit'] },
    { path: '/fund', need: ['fund:manage'] },
    { path: '/invoices', need: ['invoice:manage'] },
    { path: '/arap', need: ['arap:manage'] },
    { path: '/reports/balance-sheet', need: ['report:view'] },
    { path: '/dashboard', need: ['dashboard:view'] },
  ]
  for (const f of fallbacks) {
    if (f.need.some((c) => perms.includes(c))) return f.path
  }
  return '/login'  // 极端情况:登录态有问题,强制回登录
}

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.path === '/login') {
    if (auth.token) return { path: pickFallbackPath(auth.perms) }
    return true
  }
  if (!auth.token) {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  }
  const perm = to.meta?.perm as string[] | undefined
  if (perm && !auth.hasPerm(perm)) {
    // 路由级 perm 拒绝:走 ElMessage,但去重避免连续刷新时连环弹
    const warnKey = `__route_perm_${to.path}`
    if (!(routerWarnCache.has(warnKey) && Date.now() - routerWarnCache.get(warnKey)! < 800)) {
      routerWarnCache.set(warnKey, Date.now())
      ElMessage({
        type: 'warning',
        message: `您当前角色无权访问「${(to.meta?.title as string) || to.path}」,已为您切换到合适页面`,
        duration: 1800,
        grouping: true,
      })
    }
    return { path: pickFallbackPath(auth.perms) }
  }
  return true
})

router.afterEach((to) => {
  const title = (to.meta?.title as string) || ''
  document.title = title ? `${title} - 中小企业财务管理系统` : '中小企业财务管理系统'
})

export default router
