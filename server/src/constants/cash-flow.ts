/**
 * 现金流量表(《小企业会计准则》表样)+ 对方科目归集映射
 *
 * 编制方法:对方科目法(电算化标准做法)
 *  - 现金及现金等价物 = cashFlowType 为 CASH/BANK 的科目(1001/1002)
 *  - 现金科目与现金科目之间的内部转换不计入流量
 *  - 现金流入/流出按同凭证「对方科目」按行归集
 *  - 未映射科目落入「其他经营」行并列入 unmapped 明细供人工核对
 */

export type FlowSection = 'operating' | 'investing' | 'financing';

export interface FlowRowDef {
  key: string;
  no: number;        // 行次
  name: string;
  section: FlowSection;
  kind: 'inflow' | 'outflow' | 'subtotal' | 'net' | 'memo';
  /** 小计/净额行的构成(仅 subtotal/net/memo) */
  compose?: string[];
}

export const CASH_FLOW_ROWS: FlowRowDef[] = [
  // ── 经营活动 ──
  { key: 'f0101', no: 1, name: '销售商品、提供劳务收到的现金', section: 'operating', kind: 'inflow' },
  { key: 'f0102', no: 2, name: '收到的税费返还', section: 'operating', kind: 'inflow' },
  { key: 'f0103', no: 3, name: '收到其他与经营活动有关的现金', section: 'operating', kind: 'inflow' },
  { key: 'f0104', no: 4, name: '经营活动现金流入小计', section: 'operating', kind: 'subtotal', compose: ['f0101', 'f0102', 'f0103'] },
  { key: 'f0105', no: 5, name: '购买商品、接受劳务支付的现金', section: 'operating', kind: 'outflow' },
  { key: 'f0106', no: 6, name: '支付给职工以及为职工支付的现金', section: 'operating', kind: 'outflow' },
  { key: 'f0107', no: 7, name: '支付的各项税费', section: 'operating', kind: 'outflow' },
  { key: 'f0108', no: 8, name: '支付其他与经营活动有关的现金', section: 'operating', kind: 'outflow' },
  { key: 'f0109', no: 9, name: '经营活动现金流出小计', section: 'operating', kind: 'subtotal', compose: ['f0105', 'f0106', 'f0107', 'f0108'] },
  { key: 'f0110', no: 10, name: '经营活动产生的现金流量净额', section: 'operating', kind: 'net', compose: ['f0104', 'f0109'] },
  // ── 投资活动 ──
  { key: 'f0211', no: 11, name: '收回投资收到的现金', section: 'investing', kind: 'inflow' },
  { key: 'f0212', no: 12, name: '取得投资收益收到的现金', section: 'investing', kind: 'inflow' },
  { key: 'f0213', no: 13, name: '处置固定资产、无形资产和其他长期资产收回的现金净额', section: 'investing', kind: 'inflow' },
  { key: 'f0214', no: 14, name: '收到其他与投资活动有关的现金', section: 'investing', kind: 'inflow' },
  { key: 'f0215', no: 15, name: '投资活动现金流入小计', section: 'investing', kind: 'subtotal', compose: ['f0211', 'f0212', 'f0213', 'f0214'] },
  { key: 'f0216', no: 16, name: '购建固定资产、无形资产和其他长期资产支付的现金', section: 'investing', kind: 'outflow' },
  { key: 'f0217', no: 17, name: '投资支付的现金', section: 'investing', kind: 'outflow' },
  { key: 'f0218', no: 18, name: '支付其他与投资活动有关的现金', section: 'investing', kind: 'outflow' },
  { key: 'f0219', no: 19, name: '投资活动现金流出小计', section: 'investing', kind: 'subtotal', compose: ['f0216', 'f0217', 'f0218'] },
  { key: 'f0220', no: 20, name: '投资活动产生的现金流量净额', section: 'investing', kind: 'net', compose: ['f0215', 'f0219'] },
  // ── 筹资活动 ──
  { key: 'f0321', no: 21, name: '吸收投资收到的现金', section: 'financing', kind: 'inflow' },
  { key: 'f0322', no: 22, name: '取得借款收到的现金', section: 'financing', kind: 'inflow' },
  { key: 'f0323', no: 23, name: '收到其他与筹资活动有关的现金', section: 'financing', kind: 'inflow' },
  { key: 'f0324', no: 24, name: '筹资活动现金流入小计', section: 'financing', kind: 'subtotal', compose: ['f0321', 'f0322', 'f0323'] },
  { key: 'f0325', no: 25, name: '偿还债务支付的现金', section: 'financing', kind: 'outflow' },
  { key: 'f0326', no: 26, name: '分配股利、利润或偿付利息支付的现金', section: 'financing', kind: 'outflow' },
  { key: 'f0327', no: 27, name: '支付其他与筹资活动有关的现金', section: 'financing', kind: 'outflow' },
  { key: 'f0328', no: 28, name: '筹资活动现金流出小计', section: 'financing', kind: 'subtotal', compose: ['f0325', 'f0326', 'f0327'] },
  { key: 'f0329', no: 29, name: '筹资活动产生的现金流量净额', section: 'financing', kind: 'net', compose: ['f0324', 'f0328'] },
  // ── 合计 ──
  { key: 'f0430', no: 30, name: '现金及现金等价物净增加额', section: 'operating', kind: 'net', compose: ['f0110', 'f0220', 'f0329'] },
  { key: 'f0431', no: 31, name: '加:期初现金及现金等价物余额', section: 'operating', kind: 'memo' },
  { key: 'f0432', no: 32, name: '期末现金及现金等价物余额', section: 'operating', kind: 'memo' },
];

/**
 * 对方科目编码 → 流量行映射。
 * 匹配规则:取「最长命中前缀」;未命中落入「其他经营」行并计入 unmapped。
 * key: 前缀;value: [流入行, 流出行](现金借方=流入取[0],贷方=流出取[1])
 */
export const COUNTER_FLOW_MAP: Array<{ prefix: string; inflow?: string; outflow?: string }> = [
  // 销售/往来 —— 收现
  { prefix: '5001', inflow: 'f0101' }, // 主营业务收入
  { prefix: '5051', inflow: 'f0101' }, // 其他业务收入
  { prefix: '1121', inflow: 'f0101' }, // 应收票据(收款/贴现)
  { prefix: '1122', inflow: 'f0101' }, // 应收账款
  { prefix: '2203', inflow: 'f0101', outflow: 'f0105' }, // 预收账款(退预收=购货退回性质)
  { prefix: '2221', inflow: 'f0102', outflow: 'f0107' }, // 应交税费(返还/缴税)
  // 存货/采购 —— 购买商品付现
  { prefix: '1401', outflow: 'f0105' }, // 材料采购
  { prefix: '1402', outflow: 'f0105' }, // 在途物资
  { prefix: '1403', outflow: 'f0105' }, // 原材料
  { prefix: '1404', outflow: 'f0105' }, // 材料成本差异
  { prefix: '1405', outflow: 'f0105' }, // 库存商品
  { prefix: '1408', outflow: 'f0105' }, // 委托加工物资
  { prefix: '1411', outflow: 'f0105' }, // 周转材料
  { prefix: '1123', outflow: 'f0105', inflow: 'f0103' }, // 预付账款(付=购货;预付退回=其他经营)
  { prefix: '2201', outflow: 'f0105' }, // 应付票据(承兑付款)
  { prefix: '2202', outflow: 'f0105' }, // 应付账款
  { prefix: '4001', outflow: 'f0105' }, // 生产成本(劳务现付)
  { prefix: '4301', outflow: 'f0105' }, // 劳务成本
  // 职工薪酬
  { prefix: '2211', inflow: 'f0103', outflow: 'f0106' }, // 应付职工薪酬(代垫退回=其他)
  // 期间费用 —— 其他经营
  { prefix: '5601', outflow: 'f0108' }, // 销售费用
  { prefix: '5602', outflow: 'f0108' }, // 管理费用
  // 营业外
  { prefix: '5201', inflow: 'f0103' }, // 营业外收入(罚款等=其他经营流入)
  { prefix: '5711', outflow: 'f0108' }, // 营业外支出(罚款等=其他经营流出)
  // 其他往来 —— 其他经营
  { prefix: '1221', inflow: 'f0103', outflow: 'f0108' }, // 其他应收款(备用金/押金)
  { prefix: '2241', inflow: 'f0103', outflow: 'f0108' }, // 其他应付款
  { prefix: '1901', inflow: 'f0103', outflow: 'f0108' }, // 待处理财产损溢
  // 投资
  { prefix: '1101', inflow: 'f0211', outflow: 'f0217' }, // 短期投资
  { prefix: '1501', inflow: 'f0211', outflow: 'f0217' }, // 长期债券投资
  { prefix: '1511', inflow: 'f0211', outflow: 'f0217' }, // 长期股权投资
  { prefix: '1131', inflow: 'f0212' }, // 应收股利
  { prefix: '1132', inflow: 'f0212' }, // 应收利息
  { prefix: '5111', inflow: 'f0212' }, // 投资收益
  { prefix: '1606', inflow: 'f0213', outflow: 'f0216' }, // 固定资产清理
  { prefix: '1701', inflow: 'f0213', outflow: 'f0216' }, // 无形资产
  { prefix: '1702', inflow: 'f0213', outflow: 'f0216' }, // 累计摊销(处置)
  { prefix: '1601', inflow: 'f0213', outflow: 'f0216' }, // 固定资产(直接处置=收回;购建=支付)
  { prefix: '1602', inflow: 'f0213' }, // 累计折旧(处置转出)
  { prefix: '1604', outflow: 'f0216' }, // 在建工程
  { prefix: '1605', outflow: 'f0216' }, // 工程物资
  { prefix: '1621', inflow: 'f0213', outflow: 'f0216' }, // 生产性生物资产
  { prefix: '1801', inflow: 'f0213', outflow: 'f0216' }, // 长期待摊费用
  { prefix: '2401', inflow: 'f0214' }, // 递延收益(政府补助=其他投资)
  // 筹资
  { prefix: '3001', inflow: 'f0321' }, // 实收资本
  { prefix: '3002', inflow: 'f0321' }, // 资本公积
  { prefix: '2001', inflow: 'f0322', outflow: 'f0325' }, // 短期借款
  { prefix: '2501', inflow: 'f0322', outflow: 'f0325' }, // 长期借款
  { prefix: '2231', inflow: 'f0323', outflow: 'f0326' }, // 应付利息
  { prefix: '2232', outflow: 'f0326' }, // 应付利润
  { prefix: '5603', outflow: 'f0326' }, // 财务费用(利息直接支付)
  { prefix: '2701', inflow: 'f0323', outflow: 'f0327' }, // 长期应付款
];

/** 兜底行:未映射对方科目归入「其他经营」 */
export const FALLBACK_INFLOW = 'f0103';
export const FALLBACK_OUTFLOW = 'f0108';
