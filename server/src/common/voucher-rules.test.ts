/**
 * 凭证分录规则单测(纯函数,与 voucher.service.validateAndNormalize 同源)
 * 覆盖:行数/金额格式/方向互斥/零金额/负数(含红冲豁免)/借贷平衡/合计为正
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntryRules } from './voucher-rules';

const e = (debit: number, credit: number) => ({ debit, credit });

test('规则:两行平衡凭证通过', () => {
  const r = validateEntryRules([e(100, 0), e(0, 100)]);
  assert.equal(r.ok, true);
});

test('规则:多行平衡通过(一借多贷)', () => {
  const r = validateEntryRules([e(500, 0), e(0, 200), e(0, 300)]);
  assert.equal(r.ok, true);
});

test('规则:少于两行拒绝', () => {
  assert.equal(validateEntryRules([e(100, 0)]).ok, false);
  assert.equal(validateEntryRules([]).ok, false);
  assert.equal(validateEntryRules(undefined).ok, false);
});

test('规则:借贷不平衡拒绝(提示借/贷合计)', () => {
  const r = validateEntryRules([e(100, 0), e(0, 99)]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /借贷不平衡:借方合计 100\.00/);
});

test('规则:同行借贷方向互斥拒绝', () => {
  const r = validateEntryRules([e(100, 100), e(0, 100)]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /第1行借贷方向互斥/);
});

test('规则:金额为零拒绝', () => {
  const r = validateEntryRules([e(0, 0), e(100, 0)]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /第1行金额不能为零/);
});

test('规则:金额格式错误拒绝(NaN/字符串)', () => {
  const r = validateEntryRules([e(Number.NaN, 0), e(0, 100)]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /第1行金额格式错误/);
});

test('规则:普通凭证负数金额拒绝', () => {
  const r = validateEntryRules([e(-100, 0), e(0, -100)]);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /不允许负数金额/);
});

test('规则:红冲凭证负数放行且负平衡通过', () => {
  const r = validateEntryRules([e(-100, 0), e(0, -100)], { isRed: true });
  assert.equal(r.ok, true);
});

test('规则:合计为零拒绝(空转凭证)', () => {
  // 平衡但两侧均 < epsilon 的组合已由「金额为零」拦截;此处验证显式合计保护
  const r = validateEntryRules([e(0.00001, 0), e(0, 0.00001)], { epsilon: 0.01 });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /借贷不平衡|金额不能为零/);
});

test('规则:尾差在容差内(≤0.0001)视为平衡', () => {
  // service 与规则统一使用 0.0001 容差(金额归一化到分后自然消化)
  const r = validateEntryRules([e(100.00005, 0), e(0, 100)]);
  assert.equal(r.ok, true);
  // 超过容差即拒绝
  const r2 = validateEntryRules([e(100.005, 0), e(0, 100)]);
  assert.equal(r2.ok, false);
});
