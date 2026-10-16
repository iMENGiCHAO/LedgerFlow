/**
 * 现金流量归集单测(纯函数 classifyVouchers)
 * 覆盖:收现归集/付现归集/现金内部转换跳过/一对多按比例分摊/未映射兜底/职工薪酬/税费/筹资
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyVouchers, matchFlowRow, type ClassifyEntry } from './cashflow-classify';

/** 造一行分录 */
function ln(vid: number, code: string, cash: string | null, debit: number, credit: number, name = code): ClassifyEntry {
  return { vid, subjectId: vid * 100 + 1, code, name, cashFlowType: cash, debit, credit };
}

test('映射:最长前缀匹配(应收账款→销售收现;应交税费→税费)', () => {
  assert.equal(matchFlowRow('1122').inflow, 'f0101');
  assert.equal(matchFlowRow('2221').outflow, 'f0107');
  assert.equal(matchFlowRow('2221').inflow, 'f0102');
  // 末级科目编码(1122-001)同样命中前缀
  assert.equal(matchFlowRow('112201').inflow, 'f0101');
});

test('归集:销售收现(现金借 / 应收账款贷)→ f0101', () => {
  const r = classifyVouchers([ln(1, '1002', 'BANK', 50000, 0), ln(1, '1122', null, 0, 50000)]);
  assert.equal(r.rows.get('f0101'), 50000);
});

test('归集:银行互转(提现/存现)不计入流量', () => {
  const r = classifyVouchers([ln(1, '1002', 'BANK', 10000, 0), ln(1, '1001', 'CASH', 0, 10000)]);
  assert.equal(r.rows.size, 0);
  assert.equal(r.unmapped.size, 0);
});

test('归集:购料付款(原材料借 / 银行贷)→ f0105 流出', () => {
  const r = classifyVouchers([ln(1, '1403', null, 8000, 0), ln(1, '1002', 'BANK', 0, 8000)]);
  assert.equal(r.rows.get('f0105'), 8000);
});

test('归集:一对多按比例分摊(现金流入对应两行贷方)', () => {
  // 凭证:银行收 30000,对方:应收账款 20000 + 预收账款 10000
  const r = classifyVouchers([
    ln(1, '1002', 'BANK', 30000, 0),
    ln(1, '1122', null, 0, 20000),
    ln(1, '2203', null, 0, 10000),
  ]);
  assert.equal(r.rows.get('f0101'), 30000); // 2203 预收也映射销售行
  // 再验证分摊:预收退回场景(现金流出 5000 对应付 3000+费用 2000)
  const r2 = classifyVouchers([
    ln(2, '1002', 'BANK', 0, 5000),
    ln(2, '2203', null, 3000, 0),
    ln(2, '5602', null, 2000, 0),
  ]);
  assert.equal(r2.rows.get('f0105'), 3000);
  assert.equal(r2.rows.get('f0108'), 2000);
});

test('归集:现金流入金额小于对方合计时按比例缩减', () => {
  // 凭证:现金收 6000(对方合计 10000:应收 6000 + 其他应付款 4000)——不完整凭证场景
  const r = classifyVouchers([
    ln(1, '1001', 'CASH', 6000, 0),
    ln(1, '1122', null, 0, 6000),
    ln(1, '2241', null, 0, 4000),
  ]);
  // 6000 * (6000/10000) = 3600 → f0101;6000*(4000/10000)=2400 → f0103
  assert.equal(r.rows.get('f0101'), 3600);
  assert.equal(r.rows.get('f0103'), 2400);
});

test('归集:未映射对方科目落「其他经营」并记入 unmapped', () => {
  const r = classifyVouchers([ln(1, '1012', null, 0, 5000), ln(1, '1002', 'BANK', 5000, 0)]);
  assert.equal(r.rows.get('f0103'), 5000);
  assert.equal(r.unmapped.size, 1);
  assert.equal(r.unmapped.get('1012:inflow')?.amount, 5000);
});

test('归集:职工薪酬/税费/筹资分类正确', () => {
  // 发工资:应付职工薪酬借 / 银行贷
  const a = classifyVouchers([ln(1, '2211', null, 20000, 0), ln(1, '1002', 'BANK', 0, 20000)]);
  assert.equal(a.rows.get('f0106'), 20000);
  // 缴税:应交税费借 / 银行贷
  const b = classifyVouchers([ln(2, '2221', null, 3000, 0), ln(2, '1002', 'BANK', 0, 3000)]);
  assert.equal(b.rows.get('f0107'), 3000);
  // 取得借款:银行借 / 短期借款贷
  const c = classifyVouchers([ln(3, '1002', 'BANK', 50000, 0), ln(3, '2001', null, 0, 50000)]);
  assert.equal(c.rows.get('f0322'), 50000);
  // 还本:短期借款借 / 银行贷
  const d = classifyVouchers([ln(4, '2001', null, 20000, 0), ln(4, '1002', 'BANK', 0, 20000)]);
  assert.equal(d.rows.get('f0325'), 20000);
});

test('归集:纯非现金凭证(无现金行)不出现在结果', () => {
  const r = classifyVouchers([ln(1, '5401', null, 300, 0), ln(1, '1405', null, 0, 300)]);
  assert.equal(r.rows.size, 0);
});

test('归集:金额四舍五入到分(比例分摊尾差)', () => {
  // 10000 收现 对 3 行各 3333.333...,验证合计与舍入
  const r = classifyVouchers([
    ln(1, '1002', 'BANK', 10000, 0),
    ln(1, '1122', null, 0, 3333.33),
    ln(1, '1122', null, 0, 3333.33),
    ln(1, '1122', null, 0, 3333.34),
  ]);
  const total = r.rows.get('f0101') ?? 0;
  assert.ok(Math.abs(total - 10000) < 0.02, `f0101=${total}`);
});
