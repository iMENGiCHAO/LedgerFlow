/**
 * Vite 插件:MOCK 后端 API
 * 仅在沙箱环境（PG 不可用）下使用：拦截 /api/v1/* 返回静态 mock 数据
 * 让前端 24 个页面 100% 可见可交互，零改动验收视觉/交互/空态。
 *
 * 一旦后端 PG 启动成功，删除 vite.config.ts 里此插件的引用即可恢复。
 */
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const C = (data: any) => ({ code: 0, message: 'ok', data })

const DEMO_USERS = [
  { id: 1, username: 'admin', realName: '系统管理员', phone: '13800000001', email: 'admin@demo.cn', isSuper: true, status: 1, userRoles: [{ role: { id: 1, name: '系统管理员' } }], userTenants: [{ tenantId: 1, tenant: { id: 1, name: '演示科技有限公司' }, isDefault: true }] },
  { id: 2, username: 'cfo', realName: '张 CFO', phone: '13800000002', email: 'cfo@demo.cn', isSuper: false, status: 1, userRoles: [{ role: { id: 2, name: '财务主管' } }], userTenants: [{ tenantId: 1, tenant: { id: 1, name: '演示科技有限公司' }, isDefault: true }] },
  { id: 3, username: 'zhangsan', realName: '张三', phone: '13800000003', email: 'zhangsan@demo.cn', isSuper: false, status: 1, userRoles: [{ role: { id: 3, name: '会计' } }], userTenants: [{ tenantId: 1, tenant: { id: 1, name: '演示科技有限公司' }, isDefault: true }] },
  { id: 4, username: 'lisi', realName: '李四', phone: '13800000004', email: 'lisi@demo.cn', isSuper: false, status: 1, userRoles: [{ role: { id: 4, name: '出纳' } }], userTenants: [{ tenantId: 1, tenant: { id: 1, name: '演示科技有限公司' }, isDefault: true }] },
  { id: 5, username: 'wangwu', realName: '王五', phone: '13800000005', email: 'wangwu@demo.cn', isSuper: false, status: 1, userRoles: [{ role: { id: 5, name: '员工' } }], userTenants: [{ tenantId: 1, tenant: { id: 1, name: '演示科技有限公司' }, isDefault: true }] },
  { id: 6, username: 'boss', realName: '陈总', phone: '13800000006', email: 'boss@demo.cn', isSuper: false, status: 1, userRoles: [{ role: { id: 6, name: '总经理' } }], userTenants: [{ tenantId: 1, tenant: { id: 1, name: '演示科技有限公司' }, isDefault: true }] },
]

const ROLES = [
  { id: 1, code: 'admin', name: '系统管理员', permissions: ['*'], remark: '拥有全部权限' },
  { id: 2, code: 'cfo', name: '财务主管', permissions: ['voucher:*', 'report:*', 'closing:*', 'arap:*'], remark: '审核+报表+结账' },
  { id: 3, code: 'accountant', name: '会计', permissions: ['voucher:create', 'subject:*', 'partner:*', 'invoice:*'], remark: '日常账务' },
  { id: 4, code: 'cashier', name: '出纳', permissions: ['fund:*', 'expense:pay'], remark: '资金与付款' },
  { id: 5, code: 'employee', name: '员工', permissions: ['expense:create'], remark: '填报报销' },
  { id: 6, code: 'gm', name: '总经理', permissions: ['expense:approve:gm', 'report:view'], remark: '大额审批' },
]

const TENANTS = [
  { id: 1, name: '演示科技有限公司', taxNo: '91110000MA01ABCDXX', address: '北京市朝阳区建国路 88 号', legalRep: '陈总', status: 1, _count: { vouchers: 248 }, startYear: 2026, startMonth: 1 },
  { id: 2, name: '演示贸易有限公司', taxNo: '91110000MA02EFGHXX', address: '上海市浦东新区世纪大道 100 号', legalRep: '李总', status: 1, _count: { vouchers: 86 }, startYear: 2026, startMonth: 1 },
]

const PERMS_CATALOG = [
  { group: '凭证', items: [{ code: 'voucher:create', name: '创建凭证' }, { code: 'voucher:approve', name: '审核凭证' }, { code: 'voucher:void', name: '作废凭证' }] },
  { group: '基础', items: [{ code: 'subject:*', name: '科目管理' }, { code: 'partner:*', name: '往来单位' }] },
  { group: '报表', items: [{ code: 'report:view', name: '查看报表' }, { code: 'report:export', name: '导出报表' }] },
  { group: '期末', items: [{ code: 'closing:close', name: '执行结账' }, { code: 'closing:unclose', name: '反结账' }] },
  { group: '资金', items: [{ code: 'fund:*', name: '资金账户' }] },
  { group: '报销', items: [{ code: 'expense:create', name: '填报报销' }, { code: 'expense:approve', name: '审批' }, { code: 'expense:pay', name: '付款' }] },
  { group: '系统', items: [{ code: 'user:manage', name: '用户管理' }, { code: 'role:manage', name: '角色管理' }] },
]

const PARTNERS = [
  { id: 1, code: 'C001', name: '北京蓝鲸科技有限公司', type: 1, typeName: '客户', contact: '王经理', phone: '010-66668888', taxNo: '91110000C001XX', status: 1, creditLimit: 500000 },
  { id: 2, code: 'C002', name: '上海云端数据有限公司', type: 1, typeName: '客户', contact: '李总', phone: '021-55556666', taxNo: '91110000C002XX', status: 1, creditLimit: 800000 },
  { id: 3, code: 'S001', name: '杭州供应商有限公司', type: 2, typeName: '供应商', contact: '赵经理', phone: '0571-33334444', taxNo: '91110000S001XX', status: 1, creditLimit: null },
  { id: 4, code: 'C003', name: '深圳前海贸易公司', type: 1, typeName: '客户', contact: '陈总', phone: '0755-22223333', taxNo: '91110000C003XX', status: 1, creditLimit: 300000 },
  { id: 5, code: 'S002', name: '广州物流有限公司', type: 2, typeName: '供应商', contact: '钱经理', phone: '020-11112222', taxNo: '91110000S002XX', status: 0, creditLimit: null },
]

const DEPARTMENTS = [
  { id: 1, name: '总经办', manager: '陈总', employeeCount: 2 },
  { id: 2, name: '财务部', manager: '张 CFO', employeeCount: 3 },
  { id: 3, name: '销售部', manager: '王经理', employeeCount: 8 },
  { id: 4, name: '采购部', manager: '赵经理', employeeCount: 4 },
  { id: 5, name: '运营部', manager: '李总', employeeCount: 6 },
]

const PROJECTS = [
  { id: 1, code: 'P2026-01', name: '华东区拓展项目', manager: '王经理', status: 1 },
  { id: 2, code: 'P2026-02', name: '数字化升级项目', manager: '陈总', status: 1 },
  { id: 3, code: 'P2026-03', name: '品牌焕新项目', manager: '李总', status: 1 },
]

const EMPLOYEES = [
  { id: 1, name: '陈总', code: 'E001', dept: { id: 1, name: '总经办' }, position: '总经理', status: 1 },
  { id: 2, name: '张 CFO', code: 'E002', dept: { id: 2, name: '财务部' }, position: '财务总监', status: 1 },
  { id: 3, name: '张三', code: 'E003', dept: { id: 2, name: '财务部' }, position: '会计', status: 1 },
  { id: 4, name: '李四', code: 'E004', dept: { id: 2, name: '财务部' }, position: '出纳', status: 1 },
  { id: 5, name: '王五', code: 'E005', dept: { id: 3, name: '销售部' }, position: '销售经理', status: 1 },
]

const SUBJECTS_TREE = [
  {
    id: 1, code: '1001', name: '库存现金', category: 1, direction: 'D', isLeaf: true, status: 1, level: 1,
    children: [
      { id: 11, code: '1002', name: '银行存款', category: 1, direction: 'D', isLeaf: false, status: 1, level: 1, parentId: 1,
        children: [
          { id: 111, code: '100201', name: '工商银行(1100)', category: 1, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: false, project: false, employee: false } },
          { id: 112, code: '100202', name: '建设银行(2200)', category: 1, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: false, project: false, employee: false } },
          { id: 113, code: '100203', name: '招商银行(3300)', category: 1, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: false, project: false, employee: false } },
        ]
      },
    ]
  },
  { id: 2, code: '1122', name: '应收账款', category: 1, direction: 'D', isLeaf: true, status: 1, level: 1, assist: { partner: true, department: false, project: false, employee: false } },
  { id: 3, code: '1403', name: '原材料', category: 1, direction: 'D', isLeaf: true, status: 1, level: 1, assist: { partner: false, department: false, project: false, employee: false } },
  { id: 4, code: '1601', name: '固定资产', category: 1, direction: 'D', isLeaf: true, status: 1, level: 1, assist: { partner: false, department: true, project: false, employee: false } },
  { id: 5, code: '2202', name: '应付账款', category: 2, direction: 'C', isLeaf: true, status: 1, level: 1, assist: { partner: true, department: false, project: false, employee: false } },
  { id: 6, code: '4001', name: '实收资本', category: 3, direction: 'C', isLeaf: true, status: 1, level: 1 },
  { id: 7, code: '4101', name: '盈余公积', category: 3, direction: 'C', isLeaf: true, status: 1, level: 1 },
  { id: 8, code: '5001', name: '生产成本', category: 4, direction: 'D', isLeaf: true, status: 1, level: 1, assist: { partner: false, department: true, project: true, employee: false } },
  { id: 9, code: '6001', name: '主营业务收入', category: 5, direction: 'C', isLeaf: true, status: 1, level: 1, assist: { partner: true, department: false, project: false, employee: false } },
  { id: 10, code: '6401', name: '主营业务成本', category: 5, direction: 'D', isLeaf: true, status: 1, level: 1, assist: { partner: true, department: false, project: false, employee: false } },
  { id: 11, code: '6601', name: '销售费用', category: 5, direction: 'D', isLeaf: false, status: 1, level: 1, parentId: null,
    children: [
      { id: 1111, code: '660101', name: '工资薪酬', category: 5, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: true, project: false, employee: true } },
      { id: 1112, code: '660102', name: '办公费', category: 5, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: true, project: false, employee: false } },
      { id: 1113, code: '660103', name: '差旅费', category: 5, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: true, project: false, employee: true } },
      { id: 1114, code: '660104', name: '业务招待费', category: 5, direction: 'D', isLeaf: true, status: 1, level: 2, parentId: 11, assist: { partner: false, department: true, project: false, employee: false } },
    ]
  },
  { id: 12, code: '6602', name: '管理费用', category: 5, direction: 'D', isLeaf: true, status: 1, level: 1, assist: { partner: false, department: true, project: false, employee: false } },
  { id: 13, code: '6603', name: '财务费用', category: 5, direction: 'D', isLeaf: true, status: 1, level: 1 },
]

const SUBJECTS_FLAT = (() => {
  const out: any[] = []
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      const { children, ...rest } = n
      out.push(rest)
      if (children) walk(children)
    }
  }
  walk(SUBJECTS_TREE)
  return out
})()

const PERIODS = [
  { id: 1, year: 2026, month: 1, status: 2, statusName: '已结账' },
  { id: 2, year: 2026, month: 2, status: 1, statusName: '进行中' },
  { id: 3, year: 2026, month: 3, status: 0, statusName: '未开始' },
]

const INITIAL_BALANCES = [
  { subjectId: 111, code: '100201', name: '工商银行(1100)', category: 1, direction: 'D', debit: 800000, credit: 0 },
  { subjectId: 112, code: '100202', name: '建设银行(2200)', category: 1, direction: 'D', debit: 350000, credit: 0 },
  { subjectId: 113, code: '100203', name: '招商银行(3300)', category: 1, direction: 'D', debit: 120000, credit: 0 },
  { subjectId: 2,  code: '1122',    name: '应收账款',     category: 1, direction: 'D', debit: 280000, credit: 0 },
  { subjectId: 3,  code: '1403',    name: '原材料',         category: 1, direction: 'D', debit: 150000, credit: 0 },
  { subjectId: 4,  code: '1601',    name: '固定资产',     category: 1, direction: 'D', debit: 1200000, credit: 0 },
  { subjectId: 5,  code: '2202',    name: '应付账款',     category: 2, direction: 'C', debit: 0, credit: 180000 },
  { subjectId: 6,  code: '4001',    name: '实收资本',     category: 3, direction: 'C', debit: 0, credit: 2000000 },
  { subjectId: 7,  code: '4101',    name: '盈余公积',     category: 3, direction: 'C', debit: 0, credit: 720000 },
]

const VOUCHERS = Array.from({ length: 18 }, (_, i) => {
  const month = i < 8 ? 1 : 2
  const day = ((i * 7) % 28) + 1
  const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const words = ['记', '收', '付', '转']
  const statuses = [1, 1, 1, 2, 2, 3, 1, 1, 0, 1, 2, 3, 1, 1, 2, 0, 1, 1]
  const st = statuses[i]
  const types = ['收款', '付款', '转账', '费用', '结转']
  const t = types[i % types.length]
  const amount = 1000 + (i * 1734) % 80000
  return {
    id: i + 1,
    voucherNo: `${month}-${String(i + 1).padStart(3, '0')}`,
    word: words[i % 4],
    no: i + 1,
    date,
    periodId: month,
    summary: t === '收款' ? '收到北京蓝鲸货款' : t === '付款' ? '支付办公用品费' : t === '转账' ? '工行转建行' : t === '费用' ? '报销差旅费' : '结转本月损益',
    total: amount,
    status: st,
    statusName: ['草稿', '待审核', '已审核', '已记账'][st],
    creator: { id: 3, realName: '张三' },
    auditor: st >= 2 ? { id: 2, realName: '张 CFO' } : null,
    entryCount: 2 + (i % 3),
  }
})

const ARAP_BILLS = [
  { id: 1, billNo: 'YS-2026-0001', type: 1, typeName: '应收', date: '2026-02-05', partner: { id: 1, name: '北京蓝鲸科技有限公司' }, amount: 128000, settled: 88000, balance: 40000, dueDate: '2026-03-05', status: 1, statusName: '部分核销', voucher: null, overdue: false },
  { id: 2, billNo: 'YS-2026-0002', type: 1, typeName: '应收', date: '2026-01-20', partner: { id: 2, name: '上海云端数据有限公司' }, amount: 86000, settled: 0, balance: 86000, dueDate: '2026-02-20', status: 0, statusName: '未核销', voucher: null, overdue: true },
  { id: 3, billNo: 'YS-2026-0003', type: 1, typeName: '应收', date: '2026-02-18', partner: { id: 4, name: '深圳前海贸易公司' }, amount: 56000, settled: 56000, balance: 0, dueDate: '2026-03-18', status: 2, statusName: '已核销', voucher: { id: 12, word: '记', no: 12 }, overdue: false },
  { id: 4, billNo: 'YF-2026-0001', type: 2, typeName: '应付', date: '2026-02-08', partner: { id: 3, name: '杭州供应商有限公司' }, amount: 76000, settled: 30000, balance: 46000, dueDate: '2026-03-08', status: 1, statusName: '部分核销', voucher: null, overdue: false },
  { id: 5, billNo: 'YF-2026-0002', type: 2, typeName: '应付', date: '2026-01-25', partner: { id: 5, name: '广州物流有限公司' }, amount: 23000, settled: 0, balance: 23000, dueDate: '2026-02-25', status: 0, statusName: '未核销', voucher: null, overdue: true },
  { id: 6, billNo: 'YS-2026-0004', type: 1, typeName: '应收', date: '2026-02-22', partner: { id: 1, name: '北京蓝鲸科技有限公司' }, amount: 192000, settled: 0, balance: 192000, dueDate: '2026-04-22', status: 0, statusName: '未核销', voucher: null, overdue: false },
]

const ARAP_AGING = {
  total: 387000,
  buckets: [
    { label: '0-30 天', receivable: 192000, payable: 46000 },
    { label: '31-60 天', receivable: 40000, payable: 23000 },
    { label: '61-90 天', receivable: 86000, payable: 0 },
    { label: '90+ 天',  receivable: 0, payable: 0 },
  ],
}

const INVOICES = [
  { id: 1, code: 'XS2026020001', type: 'out', typeName: '销项', date: '2026-02-05', partner: '北京蓝鲸科技有限公司', amount: 128000, tax: 16640, total: 144640, status: 2, statusName: '已认证', voucher: { id: 8, word: '记', no: 8 } },
  { id: 2, code: 'XS2026020002', type: 'out', typeName: '销项', date: '2026-02-12', partner: '上海云端数据有限公司', amount: 86000, tax: 11180, total: 97180, status: 1, statusName: '已登记', voucher: null },
  { id: 3, code: 'XS2026020003', type: 'out', typeName: '销项', date: '2026-02-18', partner: '深圳前海贸易公司', amount: 56000, tax: 7280, total: 63280, status: 2, statusName: '已认证', voucher: { id: 12, word: '记', no: 12 } },
  { id: 4, code: 'JX2026020001', type: 'in', typeName: '进项', date: '2026-02-08', partner: '杭州供应商有限公司', amount: 76000, tax: 9880, total: 85880, status: 2, statusName: '已认证', voucher: null },
  { id: 5, code: 'JX2026020002', type: 'in', typeName: '进项', date: '2026-02-15', partner: '办公用品批发', amount: 12800, tax: 1664, total: 14464, status: 1, statusName: '已登记', voucher: null },
  { id: 6, code: 'JX2026020003', type: 'in', typeName: '进项', date: '2026-02-21', partner: '电力公司', amount: 3400, tax: 442, total: 3842, status: 2, statusName: '已认证', voucher: null },
]

const VAT_SUMMARY = {
  output: 35020, // 销项
  input: 11986,  // 进项
  payable: 23034, // 应纳 = 销项 - 进项
}

const FUND_ACCOUNTS = [
  { id: 1, code: '100201', name: '工商银行(1100)', type: 2, typeName: '银行', balance: 800000, active: true, lastSyncAt: '2026-02-28 18:30' },
  { id: 2, code: '100202', name: '建设银行(2200)', type: 2, typeName: '银行', balance: 350000, active: true, lastSyncAt: '2026-02-28 18:30' },
  { id: 3, code: '100203', name: '招商银行(3300)', type: 2, typeName: '银行', balance: 120000, active: false, lastSyncAt: '2026-02-25 12:00' },
  { id: 4, code: '1001', name: '库存现金', type: 1, typeName: '现金', balance: 8000, active: true, lastSyncAt: '2026-02-28 18:30' },
]

const FUND_JOURNALS = Array.from({ length: 14 }, (_, i) => {
  const dir = i % 3 === 0 ? 'in' : i % 3 === 1 ? 'out' : 'in'
  return {
    id: i + 1,
    date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
    account: FUND_ACCOUNTS[i % 4],
    dir: dir === 'in' ? 'D' : 'C',
    dirName: dir === 'in' ? '收入' : '支出',
    summary: dir === 'in' ? '收到销售货款' : '支付办公用品费',
    amount: 1000 + (i * 1973) % 30000,
    voucher: { id: 100 + i, word: ['记', '收', '付', '转'][i % 4], no: 100 + i },
    settleType: ['电汇', '现金', '转账', '汇票'][i % 4],
    status: i < 10 ? 2 : 1,
    statusName: i < 10 ? '已对账' : '未对账',
  }
})

const RECONCILIATION = {
  period: '2026-02',
  summary: { bankBalance: 1270000, bookBalance: 1272400, diff: -2400, status: 'warning' },
  items: [
    { id: 1, account: FUND_ACCOUNTS[0], bankIn: 180000, bankOut: 76000, bookIn: 180000, bookOut: 78400, diff: -2400, status: 'unmatched' },
    { id: 2, account: FUND_ACCOUNTS[1], bankIn: 92000, bankOut: 34000, bookIn: 92000, bookOut: 34000, diff: 0, status: 'matched' },
  ],
}

const ASSETS = [
  { id: 1, code: 'FA-0001', name: '办公室中央空调', category: { id: 1, name: '电子设备' }, model: '海尔 KFRd-72LW', dept: { id: 1, name: '总经办' }, originalValue: 38000, netValue: 28500, depreciationMonth: 800, useMonth: 12, purchaseDate: '2025-02-15', status: 1, statusName: '在用' },
  { id: 2, code: 'FA-0002', name: '财务服务器', category: { id: 1, name: '电子设备' }, model: 'Dell PowerEdge R750', dept: { id: 2, name: '财务部' }, originalValue: 86000, netValue: 64500, depreciationMonth: 1800, useMonth: 12, purchaseDate: '2025-02-20', status: 1, statusName: '在用' },
  { id: 3, code: 'FA-0003', name: '商务用车', category: { id: 2, name: '运输工具' }, model: '别克 GL8 652T', dept: { id: 1, name: '总经办' }, originalValue: 320000, netValue: 252000, depreciationMonth: 5667, useMonth: 12, purchaseDate: '2025-03-08', status: 1, statusName: '在用' },
  { id: 4, code: 'FA-0004', name: '办公桌椅(套)', category: { id: 3, name: '办公家具' }, model: '实木办公家具', dept: { id: 2, name: '财务部' }, originalValue: 28000, netValue: 23800, depreciationMonth: 350, useMonth: 12, purchaseDate: '2025-01-10', status: 1, statusName: '在用' },
  { id: 5, code: 'FA-0005', name: '复印机', category: { id: 1, name: '电子设备' }, model: 'Canon iR-2625', dept: { id: 2, name: '财务部' }, originalValue: 12000, netValue: 9000, depreciationMonth: 250, useMonth: 12, purchaseDate: '2025-02-10', status: 1, statusName: '在用' },
]

const CLAIMS = [
  { id: 1, claimNo: 'BX-202602-0001', title: '2 月销售部差旅费', applicant: { id: 5, realName: '王五' }, dept: { id: 3, name: '销售部' }, total: 3460, status: 0, statusName: '草稿', currentNode: '未提交', payVoucher: null, createdAt: '2026-02-25 14:20' },
  { id: 2, claimNo: 'BX-202602-0002', title: '客户拜访出租车票', applicant: { id: 5, realName: '王五' }, dept: { id: 3, name: '销售部' }, total: 1280, status: 1, statusName: '待部门审批', currentNode: '部门审批中', payVoucher: null, createdAt: '2026-02-26 09:10' },
  { id: 3, claimNo: 'BX-202602-0003', title: '财务部办公用品采购', applicant: { id: 3, realName: '张三' }, dept: { id: 2, name: '财务部' }, total: 680, status: 2, statusName: '待总经理审批', currentNode: '总经理审批中', payVoucher: null, createdAt: '2026-02-27 11:35' },
  { id: 4, claimNo: 'BX-202602-0004', title: '2 月高管商务接待', applicant: { id: 1, realName: '陈总' }, dept: { id: 1, name: '总经办' }, total: 8260, status: 3, statusName: '待财务复核', currentNode: '财务复核中', payVoucher: null, createdAt: '2026-02-27 19:00' },
  { id: 5, claimNo: 'BX-202602-0005', title: '技术培训差旅', applicant: { id: 5, realName: '王五' }, dept: { id: 3, name: '销售部' }, total: 12080, status: 4, statusName: '待付款', currentNode: '出纳付款中', payVoucher: null, createdAt: '2026-02-28 10:15' },
  { id: 6, claimNo: 'BX-202601-0028', title: '元月销售推广活动', applicant: { id: 5, realName: '王五' }, dept: { id: 3, name: '销售部' }, total: 5600, status: 5, statusName: '已付款', currentNode: '已完成', payVoucher: { id: 88, word: '付', no: 88 }, createdAt: '2026-01-30 16:00' },
]

const LOGS = Array.from({ length: 24 }, (_, i) => {
  const actions = ['登录系统', '创建凭证', '审核凭证', '导出报表', '修改用户', '创建报销单', '审批报销', '结账操作', '备份数据', '导入发票']
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'GET']
  const users = ['admin', 'cfo', 'zhangsan', 'lisi', 'wangwu']
  return {
    id: i + 1,
    createdAt: `2026-02-${String(28 - (i % 28)).padStart(2, '0')} ${String(8 + (i % 10)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}:00`,
    username: users[i % users.length],
    action: actions[i % actions.length],
    method: methods[i % methods.length],
    path: `/api/v1/vouchers/${(i % 20) + 1}`,
    targetId: i < 5 ? null : (i + 1),
    ip: `192.168.0.${10 + (i % 20)}`,
    detail: i % 3 === 0 ? null : `成功执行操作 #${i + 1},响应耗时 ${100 + (i * 7) % 800}ms`,
  }
})

const BACKUPS = [
  { id: 1, fileName: 'fm_backup_20260228_180000.sql.gz', size: 4862100, createdAt: '2026-02-28 18:00:00' },
  { id: 2, fileName: 'fm_backup_20260227_180000.sql.gz', size: 4812300, createdAt: '2026-02-27 18:00:00' },
  { id: 3, fileName: 'fm_backup_20260226_180000.sql.gz', size: 4798000, createdAt: '2026-02-26 18:00:00' },
  { id: 4, fileName: 'fm_backup_20260225_180000.sql.gz', size: 4756400, createdAt: '2026-02-25 18:00:00' },
]

const SUMMARIES = [
  { id: 1, year: 2026, month: 1, debitTotal: 1280000, creditTotal: 1280000, balanced: true },
  { id: 2, year: 2026, month: 2, debitTotal: 642000, creditTotal: 642000, balanced: true },
]

// 工具
function listResponse<T>(items: T[], total?: number) { return C({ list: items, total: total ?? items.length }) }

const routes: Array<{ method: string; pattern: RegExp; handler: (m: RegExpMatchArray, body: any, q: any) => any }> = [
  // 认证
  { method: 'POST', pattern: /^\/auth\/login$/, handler: (m, body) => {
    const u = DEMO_USERS.find(x => x.username === body.username) || DEMO_USERS[0]
    return C({ token: 'mock-token-' + Date.now(), refreshToken: 'mock-refresh-' + Date.now(), user: u, tenants: TENANTS, currentTenant: TENANTS[0] })
  }},
  { method: 'POST', pattern: /^\/auth\/password$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/auth\/switch-tenant$/, handler: () => C({ ok: true }) },
  { method: 'GET',  pattern: /^\/auth\/profile$/, handler: () => C(DEMO_USERS[2]) },

  // 看板
  { method: 'GET', pattern: /^\/dashboard\/summary$/, handler: () => C({
    cashPosition: 1278000, cashChange: 12.3,
    arOverdue: 86000, arOverdueChange: -8.5,
    monthProfit: 248600, monthProfitChange: 18.2,
    pendingTodos: 7,
    monthlyTrend: Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}月`,
      income: 380000 + Math.round(Math.sin(i * 0.6) * 80000) + i * 12000,
      expense: 280000 + Math.round(Math.cos(i * 0.6) * 50000) + i * 8000,
    })),
    topExpenses: [
      { name: '工资薪酬', amount: 320000, ratio: 38 },
      { name: '业务招待', amount: 86000,  ratio: 12 },
      { name: '办公费',   amount: 62000,  ratio: 9  },
      { name: '差旅费',   amount: 48000,  ratio: 7  },
      { name: '水电费',   amount: 32000,  ratio: 4  },
    ],
  }) },

  // 基础数据
  { method: 'GET', pattern: /^\/subjects\/tree$/, handler: () => C({ list: SUBJECTS_FLAT, tree: SUBJECTS_TREE }) },
  { method: 'POST', pattern: /^\/subjects$/, handler: () => C({ id: Date.now() }) },
  { method: 'PUT',  pattern: /^\/subjects\/\d+$/, handler: () => C({ ok: true }) },

  { method: 'GET',  pattern: /^\/partners$/, handler: () => listResponse(PARTNERS) },
  { method: 'POST', pattern: /^\/partners$/, handler: () => C({ id: Date.now() }) },
  { method: 'DELETE', pattern: /^\/partners\/\d+$/, handler: () => C({ ok: true }) },

  { method: 'GET',  pattern: /^\/departments$/, handler: () => C(DEPARTMENTS) },
  { method: 'POST', pattern: /^\/departments$/, handler: () => C({ id: Date.now() }) },
  { method: 'GET',  pattern: /^\/projects$/, handler: () => C(PROJECTS) },
  { method: 'POST', pattern: /^\/projects$/, handler: () => C({ id: Date.now() }) },
  { method: 'GET',  pattern: /^\/employees$/, handler: () => C(EMPLOYEES) },
  { method: 'POST', pattern: /^\/employees$/, handler: () => C({ id: Date.now() }) },
  { method: 'GET',  pattern: /^\/summaries$/, handler: () => C(SUMMARIES) },
  { method: 'POST', pattern: /^\/summaries$/, handler: () => C({ id: Date.now() }) },

  // 期间与建账
  { method: 'GET',  pattern: /^\/periods$/, handler: () => C(PERIODS) },
  { method: 'GET',  pattern: /^\/initial-balances$/, handler: () => C({ rows: INITIAL_BALANCES, tenantStatus: 0, startYear: 2026, startMonth: 1 }) },
  { method: 'PUT',  pattern: /^\/initial-balances$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/tenants\/activate$/, handler: () => C({ ok: true }) },

  // 凭证
  { method: 'GET',  pattern: /^\/vouchers$/, handler: (m, _b, q) => {
    const list = VOUCHERS.filter(v => {
      if (q.status != null && v.status !== Number(q.status)) return false
      if (q.keyword && !v.summary.includes(q.keyword)) return false
      return true
    })
    return listResponse(list)
  }},
  { method: 'GET',  pattern: /^\/vouchers\/\d+$/, handler: (m) => {
    const id = Number(m[0].split('/').pop())
    const v = VOUCHERS.find(x => x.id === id) || VOUCHERS[0]
    return C({ ...v, items: [
      { id: 1, subjectCode: '100201', subjectName: '工商银行(1100)', summary: '收款', debit: v.total, credit: 0, partner: null, dept: null, project: null, employee: null },
      { id: 2, subjectCode: '6001', subjectName: '主营业务收入', summary: '销售收入', debit: 0, credit: v.total, partner: { id: 1, name: '北京蓝鲸科技有限公司' }, dept: null, project: null, employee: null },
    ] })
  }},
  { method: 'POST', pattern: /^\/vouchers$/, handler: () => C({ id: Date.now() }) },
  { method: 'PUT',  pattern: /^\/vouchers\/\d+$/, handler: () => C({ ok: true }) },
  { method: 'DELETE', pattern: /^\/vouchers\/\d+$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/vouchers\/\d+\/submit$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/vouchers\/\d+\/reject$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/vouchers\/\d+\/approve$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/vouchers\/\d+\/cancel-audit$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/vouchers\/\d+\/void$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/vouchers\/\d+\/red-flush$/, handler: () => C({ ok: true }) },

  // 期末处理
  { method: 'GET',  pattern: /^\/closing\/checklist$/, handler: () => C({ period: PERIODS[1], items: [
    { key: 'prev_closed', name: '上期已结账', pass: true,  blocking: true,  detail: '2026-01 已完成结账' },
    { key: 'no_pending',  name: '无待审凭证', pass: true,  blocking: true,  detail: '当前期间 0 张待审' },
    { key: 'prof_carry',  name: '损益已结转', pass: true,  blocking: true,  detail: '本期损益已结转至本年利润' },
    { key: 'balanced',    name: '试算平衡',   pass: true,  blocking: true,  detail: '借方 ¥642,000.00 = 贷方 ¥642,000.00' },
    { key: 'deprec',      name: '折旧已计提', pass: true,  blocking: false, detail: '本月折旧 ¥8,667.00 已生成凭证' },
  ] }) },
  { method: 'POST', pattern: /^\/closing\/close$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/closing\/un-close$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/closing\/profit-carryforward$/, handler: () => C({ voucherId: 999 }) },
  { method: 'POST', pattern: /^\/closing\/depreciation$/, handler: () => C({ voucherId: 998 }) },

  // 报表
  { method: 'GET', pattern: /^\/reports\/balance-sheet$/, handler: () => C({
    period: '2026-02-28',
    assets: [
      { code: '1001', name: '货币资金', direction: 'D', endBalance: 1278000, isTotal: false },
      { code: '1122', name: '应收账款', direction: 'D', endBalance: 286000, isTotal: false },
      { code: '1403', name: '存货',     direction: 'D', endBalance: 152000, isTotal: false },
      { code: '1601', name: '固定资产', direction: 'D', endBalance: 1102000, isTotal: false },
    ],
    assetsTotal: 2818000,
    liab: [
      { code: '2202', name: '应付账款', direction: 'C', endBalance: 184000, isTotal: false },
      { code: '2241', name: '应付职工薪酬', direction: 'C', endBalance: 128000, isTotal: false },
    ],
    liabTotal: 312000,
    equity: [
      { code: '4001', name: '实收资本', direction: 'C', endBalance: 2000000, isTotal: false },
      { code: '4101', name: '盈余公积', direction: 'C', endBalance: 720000, isTotal: false },
      { code: '3131', name: '本年利润', direction: 'C', endBalance: 248600, isTotal: true },
    ],
    equityTotal: 2968600,
    liabEquityTotal: 3280600,
    balanced: false,
  }) },
  { method: 'GET', pattern: /^\/reports\/income$/, handler: () => C({
    period: '2026-02',
    rows: [
      { code: '6001', name: '一、营业收入', direction: 'C', monthAmount: 642000, yearAmount: 1986000, isHeader: true, isItem: false },
      { code: '6001', name: '  主营业务收入', direction: 'C', monthAmount: 642000, yearAmount: 1986000, isHeader: false, isItem: true },
      { code: '6401', name: '二、营业成本', direction: 'D', monthAmount: 360000, yearAmount: 1120000, isHeader: true, isItem: false },
      { code: '6401', name: '  主营业务成本', direction: 'D', monthAmount: 360000, yearAmount: 1120000, isHeader: false, isItem: true },
      { code: '6601', name: '三、销售费用', direction: 'D', monthAmount: 22000, yearAmount: 86000, isHeader: true, isItem: false },
      { code: '6602', name: '四、管理费用', direction: 'D', monthAmount: 8900, yearAmount: 32000, isHeader: true, isItem: false },
      { code: '6603', name: '五、财务费用', direction: 'D', monthAmount: 2400, yearAmount: 9800, isHeader: true, isItem: false },
      { code: '9999', name: '四、净利润', direction: 'C', monthAmount: 248700, yearAmount: 738200, isHeader: true, isItem: false },
    ],
  }) },
  { method: 'GET', pattern: /^\/reports\/balance-summary$/, handler: () => C({
    period: '2026-02',
    rows: [
      { code: '1001', name: '库存现金', direction: 'D', beginBalance: 8000,    debitAmount: 0,     creditAmount: 1200, endBalance: 6800 },
      { code: '1002', name: '银行存款', direction: 'D', beginBalance: 1200000, debitAmount: 780000, creditAmount: 720000, endBalance: 1260000 },
      { code: '1122', name: '应收账款', direction: 'D', beginBalance: 240000,  debitAmount: 286000, creditAmount: 240000, endBalance: 286000 },
      { code: '1403', name: '原材料',   direction: 'D', beginBalance: 148000,  debitAmount: 76000,  creditAmount: 72000,  endBalance: 152000 },
      { code: '1601', name: '固定资产', direction: 'D', beginBalance: 1110000, debitAmount: 0,      creditAmount: 8000,  endBalance: 1102000 },
      { code: '2202', name: '应付账款', direction: 'C', beginBalance: 156000,  debitAmount: 72000,  creditAmount: 100000, endBalance: 184000 },
      { code: '4001', name: '实收资本', direction: 'C', beginBalance: 2000000, debitAmount: 0,      creditAmount: 0,     endBalance: 2000000 },
      { code: '4101', name: '盈余公积', direction: 'C', beginBalance: 720000,  debitAmount: 0,      creditAmount: 0,     endBalance: 720000 },
    ],
  }) },
  { method: 'GET', pattern: /^\/reports\/detail-ledger\/\d+$/, handler: () => C({
    subject: { id: 100, code: '1002', name: '银行存款' },
    period: '2026-02',
    rows: [
      { date: '2026-02-01', voucherNo: '2-001', word: '记', no: 1, summary: '期初余额', debit: 0, credit: 0, balance: 1200000, isSpecial: 'init' },
      { date: '2026-02-03', voucherNo: '2-002', word: '收', no: 2, summary: '收到北京蓝鲸货款', debit: 128000, credit: 0, balance: 1328000, isSpecial: null },
      { date: '2026-02-05', voucherNo: '2-003', word: '付', no: 3, summary: '支付办公用品费', debit: 0, credit: 6800, balance: 1321200, isSpecial: null },
      { date: '2026-02-08', voucherNo: '2-005', word: '记', no: 5, summary: '报销差旅费', debit: 0, credit: 3460, balance: 1317740, isSpecial: null },
      { date: '2026-02-12', voucherNo: '2-006', word: '收', no: 6, summary: '收到上海云端货款', debit: 86000, credit: 0, balance: 1403740, isSpecial: null },
      { date: '2026-02-18', voucherNo: '2-008', word: '付', no: 8, summary: '工行转建行', debit: 0, credit: 120000, balance: 1283740, isSpecial: null },
      { date: '2026-02-22', voucherNo: '2-010', word: '收', no: 10, summary: '收到深圳前海货款', debit: 56000, credit: 0, balance: 1339740, isSpecial: null },
      { date: '2026-02-28', voucherNo: '2-012', word: '记', no: 12, summary: '本月合计', debit: 270000, credit: 130260, balance: 1267740, isSpecial: 'subtotal' },
      { date: '2026-02-28', voucherNo: '2-013', word: '记', no: 13, summary: '期末余额', debit: 0, credit: 0, balance: 1267740, isSpecial: 'end' },
    ],
  }) },

  // 应收应付
  { method: 'GET', pattern: /^\/arap\/bills$/, handler: () => listResponse(ARAP_BILLS) },
  { method: 'POST', pattern: /^\/arap\/bills$/, handler: () => C({ id: Date.now() }) },
  { method: 'DELETE', pattern: /^\/arap\/bills\/\d+$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/arap\/writeoffs$/, handler: () => C({ ok: true }) },
  { method: 'GET', pattern: /^\/arap\/aging$/, handler: () => C(ARAP_AGING) },

  // 发票
  { method: 'GET', pattern: /^\/invoices$/, handler: () => listResponse(INVOICES) },
  { method: 'POST', pattern: /^\/invoices$/, handler: () => C({ id: Date.now() }) },
  { method: 'POST', pattern: /^\/invoices\/import-csv$/, handler: () => C({ ok: true, imported: 12 }) },
  { method: 'POST', pattern: /^\/invoices\/\d+\/to-receivable$/, handler: () => C({ ok: true }) },
  { method: 'DELETE', pattern: /^\/invoices\/\d+$/, handler: () => C({ ok: true }) },
  { method: 'GET', pattern: /^\/invoices\/vat-summary$/, handler: () => C(VAT_SUMMARY) },

  // 资金
  { method: 'GET', pattern: /^\/fund\/accounts$/, handler: () => C(FUND_ACCOUNTS) },
  { method: 'POST', pattern: /^\/fund\/accounts$/, handler: () => C({ id: Date.now() }) },
  { method: 'GET', pattern: /^\/fund\/journals$/, handler: () => listResponse(FUND_JOURNALS) },
  { method: 'POST', pattern: /^\/fund\/statements\/import$/, handler: () => C({ ok: true, imported: 8 }) },
  { method: 'GET', pattern: /^\/fund\/statements$/, handler: () => C([]) },
  { method: 'POST', pattern: /^\/fund\/reconciliations\/auto-match$/, handler: () => C({ matched: 5 }) },
  { method: 'POST', pattern: /^\/fund\/reconciliations\/manual-match$/, handler: () => C({ ok: true }) },
  { method: 'GET', pattern: /^\/fund\/reconciliation$/, handler: () => C(RECONCILIATION) },

  // 报销
  { method: 'GET', pattern: /^\/expense-claims$/, handler: (m, _b, q) => {
    if (q.role === 'employee') return listResponse(CLAIMS.filter(c => c.applicant.id === 5))
    return listResponse(CLAIMS)
  }},
  { method: 'GET',  pattern: /^\/expense-claims\/\d+$/, handler: (m) => C({ ...CLAIMS[0], items: [
    { id: 1, expenseType: '差旅费', occurDate: '2026-02-22', amount: 1280, invoiceCount: 3, summary: '高铁北京-上海' },
    { id: 2, expenseType: '差旅费', occurDate: '2026-02-23', amount: 980, invoiceCount: 2, summary: '酒店住宿' },
    { id: 3, expenseType: '市内交通', occurDate: '2026-02-24', amount: 1200, invoiceCount: 5, summary: '出租车票' },
  ], flow: [
    { node: '提交申请', operator: '王五', time: '2026-02-25 14:20', opinion: '请审批' },
    { node: '部门审批', operator: '销售部经理', time: '2026-02-26 09:30', opinion: '同意报销' },
  ] }) },
  { method: 'POST', pattern: /^\/expense-claims$/, handler: () => C({ id: Date.now() }) },
  { method: 'POST', pattern: /^\/expense-claims\/\d+\/submit$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/expense-claims\/\d+\/decide$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/expense-claims\/\d+\/pay$/, handler: () => C({ ok: true, voucherId: 999 }) },
  { method: 'POST', pattern: /^\/expense-claims\/\d+\/withdraw$/, handler: () => C({ ok: true }) },

  // 资产
  { method: 'GET', pattern: /^\/assets$/, handler: () => C(ASSETS) },
  { method: 'POST', pattern: /^\/assets$/, handler: () => C({ id: Date.now() }) },
  { method: 'PUT', pattern: /^\/assets\/\d+$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/assets\/\d+\/dispose$/, handler: () => C({ ok: true }) },

  // 系统管理
  { method: 'GET', pattern: /^\/users$/, handler: () => listResponse(DEMO_USERS) },
  { method: 'POST', pattern: /^\/users$/, handler: () => C({ id: Date.now() }) },
  { method: 'PUT', pattern: /^\/users\/\d+$/, handler: () => C({ ok: true }) },
  { method: 'POST', pattern: /^\/users\/\d+\/reset-password$/, handler: () => C({ ok: true }) },

  { method: 'GET',  pattern: /^\/roles$/, handler: () => C(ROLES) },
  { method: 'GET',  pattern: /^\/perms-catalog$/, handler: () => C(PERMS_CATALOG) },
  { method: 'POST', pattern: /^\/roles$/, handler: () => C({ id: Date.now() }) },
  { method: 'PUT',  pattern: /^\/roles\/\d+$/, handler: () => C({ ok: true }) },

  { method: 'GET', pattern: /^\/operation-logs$/, handler: () => listResponse(LOGS) },

  { method: 'GET', pattern: /^\/tenants\/my$/, handler: () => C(TENANTS) },
  { method: 'GET', pattern: /^\/tenants$/, handler: () => C(TENANTS) },
  { method: 'POST', pattern: /^\/tenants$/, handler: () => C({ id: Date.now() }) },
  { method: 'PUT', pattern: /^\/tenants\/\d+$/, handler: () => C({ ok: true }) },

  { method: 'GET', pattern: /^\/backups$/, handler: () => C(BACKUPS) },
  { method: 'POST', pattern: /^\/backups\/run$/, handler: () => C({ fileName: 'fm_backup_20260228_190000.sql.gz' }) },
]

export function createMockApiPlugin(): Plugin {
  return {
    name: 'fm-mock-api',
    // ⚠️ P0: dev 模式才启 mock;生产构建(build)绝不能注册中间件
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/v1', (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url || ''
        const method = (req.method || 'GET').toUpperCase()
        const path = url.split('?')[0]
        const query: Record<string, string> = {}
        const qs = url.split('?')[1]
        if (qs) for (const part of qs.split('&')) { const [k, v] = part.split('='); if (k) query[k] = decodeURIComponent(v || '') }
        // ⚠️ P0 关键:含 format=xlsx|content-type= 二进制等导出类请求必须 next() 让 proxy 走到真实后端
        // 否则 mock 返回 JSON 列表,前端下载到 0KB 假 xlsx 文件
        if (query.format === 'xlsx' || query.format === 'csv' || query.format === 'pdf') {
          return next()
        }
        let body = ''
        req.on('data', c => (body += c))
        req.on('end', () => {
          let parsed: any = {}
          if (body) { try { parsed = JSON.parse(body) } catch { parsed = {} } }
          for (const r of routes) {
            if (r.method !== method) continue
            const m = path.match(r.pattern)
            if (m) {
              const data = r.handler(m, parsed, query)
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(data))
              return
            }
          }
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ code: 404, message: `MOCK not found: ${method} ${path}`, data: null }))
        })
      })
    },
  }
}
