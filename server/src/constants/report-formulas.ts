/** 三大报表公式配置(表驱动,便于适配其它准则) */

export interface BalExpr {
  t: 'bal';
  terms: { s: string[]; coef: number }[];
}
export interface ActExpr {
  t: 'act';
  s: string[];
  side: 'D' | 'C';
}
export interface RowsExpr {
  t: 'rows';
  items: { key: string; coef: number }[];
}
export type FormulaExpr = BalExpr | ActExpr | RowsExpr;

export interface FormulaRow {
  rowKey: string;
  rowName: string;
  indent?: number;
  bold?: boolean;
  expr: FormulaExpr;
  sort: number;
}

export const BALANCE_SHEET_ROWS: FormulaRow[] = [
  { rowKey: 'cash', rowName: '货币资金', indent: 1, expr: { t: 'bal', terms: [{ s: ['1001', '1002', '1012'], coef: 1 }] }, sort: 10 },
  { rowKey: 'st_invest', rowName: '短期投资', indent: 1, expr: { t: 'bal', terms: [{ s: ['1101'], coef: 1 }] }, sort: 20 },
  { rowKey: 'note_recv', rowName: '应收票据', indent: 1, expr: { t: 'bal', terms: [{ s: ['1121'], coef: 1 }] }, sort: 30 },
  { rowKey: 'ar', rowName: '应收账款', indent: 1, expr: { t: 'bal', terms: [{ s: ['1122'], coef: 1 }, { s: ['1231'], coef: -1 }] }, sort: 40 },
  { rowKey: 'prepaid', rowName: '预付账款', indent: 1, expr: { t: 'bal', terms: [{ s: ['1123'], coef: 1 }] }, sort: 50 },
  { rowKey: 'div_recv', rowName: '应收股利', indent: 1, expr: { t: 'bal', terms: [{ s: ['1131'], coef: 1 }] }, sort: 60 },
  { rowKey: 'int_recv', rowName: '应收利息', indent: 1, expr: { t: 'bal', terms: [{ s: ['1132'], coef: 1 }] }, sort: 70 },
  { rowKey: 'other_recv', rowName: '其他应收款', indent: 1, expr: { t: 'bal', terms: [{ s: ['1221'], coef: 1 }] }, sort: 80 },
  {
    rowKey: 'inventory',
    rowName: '存货',
    indent: 1,
    expr: { t: 'bal', terms: [{ s: ['1401', '1402', '1403', '1404', '1405', '1408', '1411', '1421'], coef: 1 }, { s: ['1407'], coef: -1 }] },
    sort: 90,
  },
  { rowKey: 'other_ca', rowName: '其他流动资产', indent: 1, expr: { t: 'bal', terms: [{ s: ['1901'], coef: 1 }] }, sort: 100 },
  { rowKey: 'total_ca', rowName: '流动资产合计', bold: true, expr: { t: 'rows', items: [{ key: 'cash', coef: 1 }, { key: 'st_invest', coef: 1 }, { key: 'note_recv', coef: 1 }, { key: 'ar', coef: 1 }, { key: 'prepaid', coef: 1 }, { key: 'div_recv', coef: 1 }, { key: 'int_recv', coef: 1 }, { key: 'other_recv', coef: 1 }, { key: 'inventory', coef: 1 }, { key: 'other_ca', coef: 1 }] }, sort: 110 },

  { rowKey: 'lt_debt_inv', rowName: '长期债券投资', indent: 1, expr: { t: 'bal', terms: [{ s: ['1501'], coef: 1 }] }, sort: 120 },
  { rowKey: 'lt_equity_inv', rowName: '长期股权投资', indent: 1, expr: { t: 'bal', terms: [{ s: ['1511'], coef: 1 }] }, sort: 130 },
  { rowKey: 'fixed_asset', rowName: '固定资产', indent: 1, expr: { t: 'bal', terms: [{ s: ['1601'], coef: 1 }, { s: ['1602'], coef: -1 }] }, sort: 140 },
  { rowKey: 'cip', rowName: '在建工程', indent: 1, expr: { t: 'bal', terms: [{ s: ['1604'], coef: 1 }] }, sort: 150 },
  { rowKey: 'eng_material', rowName: '工程物资', indent: 1, expr: { t: 'bal', terms: [{ s: ['1605'], coef: 1 }] }, sort: 160 },
  { rowKey: 'fa_liquidation', rowName: '固定资产清理', indent: 1, expr: { t: 'bal', terms: [{ s: ['1606'], coef: 1 }] }, sort: 170 },
  { rowKey: 'bio_asset', rowName: '生产性生物资产', indent: 1, expr: { t: 'bal', terms: [{ s: ['1621'], coef: 1 }] }, sort: 180 },
  { rowKey: 'intangible', rowName: '无形资产', indent: 1, expr: { t: 'bal', terms: [{ s: ['1701'], coef: 1 }, { s: ['1702'], coef: -1 }] }, sort: 190 },
  { rowKey: 'lt_prepaid', rowName: '长期待摊费用', indent: 1, expr: { t: 'bal', terms: [{ s: ['1801'], coef: 1 }] }, sort: 200 },
  { rowKey: 'total_nca', rowName: '非流动资产合计', bold: true, expr: { t: 'rows', items: [{ key: 'lt_debt_inv', coef: 1 }, { key: 'lt_equity_inv', coef: 1 }, { key: 'fixed_asset', coef: 1 }, { key: 'cip', coef: 1 }, { key: 'eng_material', coef: 1 }, { key: 'fa_liquidation', coef: 1 }, { key: 'bio_asset', coef: 1 }, { key: 'intangible', coef: 1 }, { key: 'lt_prepaid', coef: 1 }] }, sort: 210 },
  { rowKey: 'total_asset', rowName: '资产总计', bold: true, expr: { t: 'rows', items: [{ key: 'total_ca', coef: 1 }, { key: 'total_nca', coef: 1 }] }, sort: 220 },

  { rowKey: 'st_loan', rowName: '短期借款', indent: 1, expr: { t: 'bal', terms: [{ s: ['2001'], coef: 1 }] }, sort: 230 },
  { rowKey: 'note_pay', rowName: '应付票据', indent: 1, expr: { t: 'bal', terms: [{ s: ['2201'], coef: 1 }] }, sort: 240 },
  { rowKey: 'ap', rowName: '应付账款', indent: 1, expr: { t: 'bal', terms: [{ s: ['2202'], coef: 1 }] }, sort: 250 },
  { rowKey: 'adv_recv', rowName: '预收账款', indent: 1, expr: { t: 'bal', terms: [{ s: ['2203'], coef: 1 }] }, sort: 260 },
  { rowKey: 'payroll', rowName: '应付职工薪酬', indent: 1, expr: { t: 'bal', terms: [{ s: ['2211'], coef: 1 }] }, sort: 270 },
  { rowKey: 'tax_pay', rowName: '应交税费', indent: 1, expr: { t: 'bal', terms: [{ s: ['2221'], coef: 1 }] }, sort: 280 },
  { rowKey: 'int_pay', rowName: '应付利息', indent: 1, expr: { t: 'bal', terms: [{ s: ['2231'], coef: 1 }] }, sort: 290 },
  { rowKey: 'div_pay', rowName: '应付利润', indent: 1, expr: { t: 'bal', terms: [{ s: ['2232'], coef: 1 }] }, sort: 300 },
  { rowKey: 'other_pay', rowName: '其他应付款', indent: 1, expr: { t: 'bal', terms: [{ s: ['2241'], coef: 1 }] }, sort: 310 },
  { rowKey: 'deferred', rowName: '递延收益', indent: 1, expr: { t: 'bal', terms: [{ s: ['2401'], coef: 1 }] }, sort: 320 },
  { rowKey: 'total_cl', rowName: '流动负债合计', bold: true, expr: { t: 'rows', items: [{ key: 'st_loan', coef: 1 }, { key: 'note_pay', coef: 1 }, { key: 'ap', coef: 1 }, { key: 'adv_recv', coef: 1 }, { key: 'payroll', coef: 1 }, { key: 'tax_pay', coef: 1 }, { key: 'int_pay', coef: 1 }, { key: 'div_pay', coef: 1 }, { key: 'other_pay', coef: 1 }, { key: 'deferred', coef: 1 }] }, sort: 330 },
  { rowKey: 'lt_loan', rowName: '长期借款', indent: 1, expr: { t: 'bal', terms: [{ s: ['2501'], coef: 1 }] }, sort: 340 },
  { rowKey: 'lt_pay', rowName: '长期应付款', indent: 1, expr: { t: 'bal', terms: [{ s: ['2701'], coef: 1 }] }, sort: 350 },
  { rowKey: 'total_ncl', rowName: '非流动负债合计', bold: true, expr: { t: 'rows', items: [{ key: 'lt_loan', coef: 1 }, { key: 'lt_pay', coef: 1 }] }, sort: 360 },
  { rowKey: 'total_liab', rowName: '负债合计', bold: true, expr: { t: 'rows', items: [{ key: 'total_cl', coef: 1 }, { key: 'total_ncl', coef: 1 }] }, sort: 370 },

  { rowKey: 'paid_in', rowName: '实收资本', indent: 1, expr: { t: 'bal', terms: [{ s: ['3001'], coef: 1 }] }, sort: 380 },
  { rowKey: 'cap_reserve', rowName: '资本公积', indent: 1, expr: { t: 'bal', terms: [{ s: ['3002'], coef: 1 }] }, sort: 390 },
  { rowKey: 'surplus', rowName: '盈余公积', indent: 1, expr: { t: 'bal', terms: [{ s: ['3101'], coef: 1 }] }, sort: 400 },
  { rowKey: 'retained', rowName: '未分配利润', indent: 1, expr: { t: 'bal', terms: [{ s: ['3103', '3104'], coef: 1 }, { s: ['@pl'], coef: 1 }] }, sort: 410 },
  { rowKey: 'total_equity', rowName: '所有者权益合计', bold: true, expr: { t: 'rows', items: [{ key: 'paid_in', coef: 1 }, { key: 'cap_reserve', coef: 1 }, { key: 'surplus', coef: 1 }, { key: 'retained', coef: 1 }] }, sort: 420 },
  { rowKey: 'total_le', rowName: '负债和所有者权益总计', bold: true, expr: { t: 'rows', items: [{ key: 'total_liab', coef: 1 }, { key: 'total_equity', coef: 1 }] }, sort: 430 },
];

export const INCOME_ROWS: FormulaRow[] = [
  { rowKey: 'revenue', rowName: '一、营业收入', bold: true, expr: { t: 'act', s: ['5001', '5051'], side: 'C' }, sort: 10 },
  { rowKey: 'cogs', rowName: '减:营业成本', expr: { t: 'act', s: ['5401', '5402'], side: 'D' }, sort: 20 },
  { rowKey: 'tax_surcharge', rowName: '营业税金及附加', expr: { t: 'act', s: ['5403'], side: 'D' }, sort: 30 },
  { rowKey: 'selling', rowName: '销售费用', expr: { t: 'act', s: ['5601'], side: 'D' }, sort: 40 },
  { rowKey: 'admin', rowName: '管理费用', expr: { t: 'act', s: ['5602'], side: 'D' }, sort: 50 },
  { rowKey: 'finance', rowName: '财务费用', expr: { t: 'act', s: ['5603'], side: 'D' }, sort: 60 },
  { rowKey: 'invest_income', rowName: '加:投资收益', expr: { t: 'act', s: ['5111'], side: 'C' }, sort: 70 },
  {
    rowKey: 'op_profit',
    rowName: '二、营业利润',
    bold: true,
    expr: {
      t: 'rows',
      items: [
        { key: 'revenue', coef: 1 },
        { key: 'cogs', coef: -1 },
        { key: 'tax_surcharge', coef: -1 },
        { key: 'selling', coef: -1 },
        { key: 'admin', coef: -1 },
        { key: 'finance', coef: -1 },
        { key: 'invest_income', coef: 1 },
      ],
    },
    sort: 80,
  },
  { rowKey: 'non_op_income', rowName: '加:营业外收入', expr: { t: 'act', s: ['5201'], side: 'C' }, sort: 90 },
  { rowKey: 'non_op_expense', rowName: '减:营业外支出', expr: { t: 'act', s: ['5711'], side: 'D' }, sort: 100 },
  {
    rowKey: 'profit_total',
    rowName: '三、利润总额',
    bold: true,
    expr: { t: 'rows', items: [{ key: 'op_profit', coef: 1 }, { key: 'non_op_income', coef: 1 }, { key: 'non_op_expense', coef: -1 }] },
    sort: 110,
  },
  { rowKey: 'income_tax', rowName: '减:所得税费用', expr: { t: 'act', s: ['5801'], side: 'D' }, sort: 120 },
  {
    rowKey: 'net_profit',
    rowName: '四、净利润',
    bold: true,
    expr: { t: 'rows', items: [{ key: 'profit_total', coef: 1 }, { key: 'income_tax', coef: -1 }] },
    sort: 130,
  },
];

export const REPORT_PRESETS = [
  { reportCode: 'BS', rows: BALANCE_SHEET_ROWS },
  { reportCode: 'IS', rows: INCOME_ROWS },
];
