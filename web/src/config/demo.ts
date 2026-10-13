/**
 * 演示账号(开发/演示用)
 *
 * ⚠️ 生产部署时:
 *   1. 改 VITE_ENABLE_DEMO=false (或直接删 .env)
 *   2. 演示账号 chip 自动消失
 *   3. 用户必须用真实账号登录
 *
 * 真实账号通过后端 seed 或用户管理创建
 */

export interface DemoAccount {
  label: string
  username: string
  password: string
  tone: 'violet' | 'brand' | 'blue' | 'success' | 'warning' | 'danger'
  hint: string
}

/** 是否启用演示账号。环境变量 VITE_ENABLE_DEMO=true 才显示 */
export const DEMO_ENABLED = import.meta.env.VITE_ENABLE_DEMO === 'true'

/** 演示账号列表(仅当 DEMO_ENABLED=true 时显示) */
export const DEMO_ACCOUNTS: DemoAccount[] = DEMO_ENABLED
  ? [
    { label: '超管',     username: 'admin',    password: 'Admin@123', tone: 'violet',  hint: '全部权限 19 项' },
    { label: '财务主管', username: 'cfo',      password: 'Cfo@123',   tone: 'brand',   hint: '14 项,缺系统管理' },
    { label: '会计',     username: 'zhangsan', password: 'Acc@123',   tone: 'blue',    hint: '7 项,录凭证/应收' },
    { label: '出纳',     username: 'lisi',     password: 'Cash@123',  tone: 'success', hint: '3 项,资金/付款' },
    { label: '员工',     username: 'wangwu',   password: 'Emp@123',   tone: 'warning', hint: '1 项,我的报销' },
    { label: '总经理',   username: 'boss',     password: 'Boss@123',  tone: 'danger',  hint: '3 项,看板/审批' },
  ]
  : []
