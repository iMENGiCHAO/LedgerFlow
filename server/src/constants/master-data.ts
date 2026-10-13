/**
 * 《小企业会计准则》标准一级科目表(财会〔2011〕17号)
 * category: 1资产 2负债 3权益 4成本 5损益-收入 6损益-费用
 * direction: D 借 C 贷
 */
export interface PresetSubject {
  code: string;
  name: string;
  category: number;
  direction: 'D' | 'C';
  assist?: Record<string, boolean>;
  cashFlowType?: string;
}

export const PRESET_SUBJECTS: PresetSubject[] = [
  // ===== 资产类 =====
  { code: '1001', name: '库存现金', category: 1, direction: 'D', cashFlowType: 'CASH' },
  { code: '1002', name: '银行存款', category: 1, direction: 'D', assist: { partner: false }, cashFlowType: 'BANK' },
  { code: '1012', name: '其他货币资金', category: 1, direction: 'D' },
  { code: '1101', name: '短期投资', category: 1, direction: 'D' },
  { code: '1121', name: '应收票据', category: 1, direction: 'D', assist: { partner: true } },
  { code: '1122', name: '应收账款', category: 1, direction: 'D', assist: { partner: true } },
  { code: '1123', name: '预付账款', category: 1, direction: 'D', assist: { partner: true } },
  { code: '1131', name: '应收股利', category: 1, direction: 'D' },
  { code: '1132', name: '应收利息', category: 1, direction: 'D' },
  { code: '1221', name: '其他应收款', category: 1, direction: 'D', assist: { department: true } },
  { code: '1231', name: '坏账准备', category: 1, direction: 'C' },
  { code: '1401', name: '材料采购', category: 1, direction: 'D' },
  { code: '1402', name: '在途物资', category: 1, direction: 'D' },
  { code: '1403', name: '原材料', category: 1, direction: 'D' },
  { code: '1404', name: '材料成本差异', category: 1, direction: 'D' },
  { code: '1405', name: '库存商品', category: 1, direction: 'D' },
  { code: '1407', name: '商品进销差价', category: 1, direction: 'C' },
  { code: '1408', name: '委托加工物资', category: 1, direction: 'D' },
  { code: '1411', name: '周转材料', category: 1, direction: 'D' },
  { code: '1421', name: '消耗性生物资产', category: 1, direction: 'D' },
  { code: '1501', name: '长期债券投资', category: 1, direction: 'D' },
  { code: '1511', name: '长期股权投资', category: 1, direction: 'D' },
  { code: '1601', name: '固定资产', category: 1, direction: 'D' },
  { code: '1602', name: '累计折旧', category: 1, direction: 'C' },
  { code: '1604', name: '在建工程', category: 1, direction: 'D' },
  { code: '1605', name: '工程物资', category: 1, direction: 'D' },
  { code: '1606', name: '固定资产清理', category: 1, direction: 'D' },
  { code: '1621', name: '生产性生物资产', category: 1, direction: 'D' },
  { code: '1701', name: '无形资产', category: 1, direction: 'D' },
  { code: '1702', name: '累计摊销', category: 1, direction: 'C' },
  { code: '1801', name: '长期待摊费用', category: 1, direction: 'D' },
  { code: '1901', name: '待处理财产损溢', category: 1, direction: 'D' },
  // ===== 负债类 =====
  { code: '2001', name: '短期借款', category: 2, direction: 'C' },
  { code: '2201', name: '应付票据', category: 2, direction: 'C', assist: { partner: true } },
  { code: '2202', name: '应付账款', category: 2, direction: 'C', assist: { partner: true } },
  { code: '2203', name: '预收账款', category: 2, direction: 'C', assist: { partner: true } },
  { code: '2211', name: '应付职工薪酬', category: 2, direction: 'C' },
  { code: '2221', name: '应交税费', category: 2, direction: 'C' },
  { code: '2231', name: '应付利息', category: 2, direction: 'C' },
  { code: '2232', name: '应付利润', category: 2, direction: 'C' },
  { code: '2241', name: '其他应付款', category: 2, direction: 'C' },
  { code: '2401', name: '递延收益', category: 2, direction: 'C' },
  { code: '2501', name: '长期借款', category: 2, direction: 'C' },
  { code: '2701', name: '长期应付款', category: 2, direction: 'C' },
  // ===== 所有者权益类 =====
  { code: '3001', name: '实收资本', category: 3, direction: 'C' },
  { code: '3002', name: '资本公积', category: 3, direction: 'C' },
  { code: '3101', name: '盈余公积', category: 3, direction: 'C' },
  { code: '3103', name: '本年利润', category: 3, direction: 'C' },
  { code: '3104', name: '利润分配', category: 3, direction: 'C' },
  // ===== 成本类 =====
  { code: '4001', name: '生产成本', category: 4, direction: 'D' },
  { code: '4101', name: '制造费用', category: 4, direction: 'D', assist: { department: true } },
  { code: '4301', name: '劳务成本', category: 4, direction: 'D' },
  // ===== 损益类-收入 =====
  { code: '5001', name: '主营业务收入', category: 5, direction: 'C', assist: { project: false } },
  { code: '5051', name: '其他业务收入', category: 5, direction: 'C' },
  { code: '5111', name: '投资收益', category: 5, direction: 'C' },
  { code: '5201', name: '营业外收入', category: 5, direction: 'C' },
  // ===== 损益类-费用 =====
  { code: '5401', name: '主营业务成本', category: 6, direction: 'D' },
  { code: '5402', name: '其他业务成本', category: 6, direction: 'D' },
  { code: '5403', name: '营业税金及附加', category: 6, direction: 'D' },
  { code: '5601', name: '销售费用', category: 6, direction: 'D', assist: { department: true } },
  { code: '5602', name: '管理费用', category: 6, direction: 'D', assist: { department: true } },
  { code: '5603', name: '财务费用', category: 6, direction: 'D' },
  { code: '5711', name: '营业外支出', category: 6, direction: 'D' },
  { code: '5801', name: '所得税费用', category: 6, direction: 'D' },
];

/** 现金/银行类科目编码(现金流量表与资金模块识别用) */
export const CASH_SUBJECT_CODES = ['1001', '1002', '1012'];

/** 权限目录 */
export const PERMISSION_CATALOG: { group: string; items: { code: string; name: string }[] }[] = [
  {
    group: '系统管理',
    items: [
      { code: 'system:user', name: '用户管理' },
      { code: 'system:role', name: '角色权限' },
      { code: 'system:log', name: '操作日志' },
      { code: 'system:backup', name: '数据备份' },
    ],
  },
  {
    group: '基础设置',
    items: [{ code: 'md:manage', name: '基础档案维护(科目/往来单位/部门等)' }],
  },
  {
    group: '账务处理',
    items: [
      { code: 'ledger:init', name: '期初建账与启用' },
      { code: 'voucher:create', name: '凭证录入' },
      { code: 'voucher:audit', name: '凭证审核/记账' },
      { code: 'ledger:view', name: '账簿查询' },
      { code: 'closing:execute', name: '期末结账/反结账' },
    ],
  },
  {
    group: '报表',
    items: [{ code: 'report:view', name: '财务报表查看' }],
  },
  {
    group: '业务模块',
    items: [
      { code: 'arap:manage', name: '应收应付管理' },
      { code: 'invoice:manage', name: '发票台账' },
      { code: 'fund:manage', name: '资金管理与银行对账' },
      { code: 'expense:create', name: '费用报销申请' },
      { code: 'expense:approve', name: '费用报销审批' },
      { code: 'expense:pay', name: '报销付款' },
      { code: 'asset:manage', name: '固定资产管理' },
      { code: 'dashboard:view', name: '经营看板' },
    ],
  },
];

export const ALL_PERMS = PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.code));

export const ROLE_PRESETS: { code: string; name: string; perms: string[] | 'ALL'; remark: string }[] = [
  { code: 'ADMIN', name: '系统管理员', perms: 'ALL', remark: '全部系统管理权限,不含业务数据修改' },
  {
    code: 'CFO',
    name: '财务主管',
    perms: ['md:manage', 'ledger:init', 'voucher:create', 'voucher:audit', 'ledger:view', 'closing:execute', 'report:view', 'arap:manage', 'invoice:manage', 'fund:manage', 'expense:approve', 'expense:pay', 'asset:manage', 'dashboard:view'],
    remark: '建账、审核、结账、报表复核',
  },
  {
    code: 'ACCOUNTANT',
    name: '会计',
    perms: ['voucher:create', 'ledger:view', 'report:view', 'arap:manage', 'invoice:manage', 'asset:manage', 'expense:create'],
    remark: '凭证录入、往来核销、折旧计提',
  },
  {
    code: 'CASHIER',
    name: '出纳',
    perms: ['fund:manage', 'expense:pay', 'ledger:view'],
    remark: '收付款登记与银行对账(不相容岗位:无审核权)',
  },
  { code: 'EMPLOYEE', name: '普通员工', perms: ['expense:create'], remark: '提交报销、查看本人单据' },
  { code: 'BOSS', name: '总经理', perms: ['dashboard:view', 'report:view', 'expense:approve'], remark: '看板报表只读、大额审批' },
];
