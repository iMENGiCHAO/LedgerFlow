import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BalanceService, periodSeq } from './modules/ledger/balance.service';

const bal = (openD = 0, openC = 0, d = 0, c = 0): Parameters<typeof BalanceService.naturalClose>[0] => {
  const netOpen = openD - openC;
  const net = netOpen + d - c;
  return net >= 0
    ? { subjectId: 1, openDebit: netOpen, openCredit: 0, debit: d, credit: c, ytdDebit: 0, ytdCredit: 0, closeDebit: net, closeCredit: 0 }
    : { subjectId: 1, openDebit: 0, openCredit: -netOpen, debit: d, credit: c, ytdDebit: 0, ytdCredit: 0, closeDebit: 0, closeCredit: -net };
};

test('periodSeq 序列号计算', () => {
  assert.equal(periodSeq(2026, 1), 24313);
  assert.equal(periodSeq(2026, 12), 24324);
  assert.ok(periodSeq(2027, 1) > periodSeq(2026, 12));
});

test('自然余额归一化:借方科目', () => {
  const b = bal(1000, 0, 500, 200);
  assert.equal(BalanceService.naturalClose(b, 'D'), 1300);
});

test('自然余额归一化:贷方科目(累计折旧类)', () => {
  const b = bal(0, 1000, 100, 300);
  assert.equal(BalanceService.naturalClose(b, 'C'), 1200);
});

test('余额方向翻转:借方科目出现贷方余额', () => {
  const b = bal(100, 0, 0, 500);
  assert.equal(BalanceService.naturalClose(b, 'D'), -400);
  assert.equal(b.closeDebit, 0);
  assert.equal(b.closeCredit, 400);
});

test('折旧月提计算边界(模拟平均年限法)', () => {
  // 原值35000 残值5% 36期 → 月提 923.61
  const totalDep = Math.round(35000 * (1 - 0.05) * 100) / 100;
  const monthly = Math.round((totalDep / 36) * 100) / 100;
  assert.equal(totalDep, 33250);
  assert.equal(monthly, 923.61);
  // 提足后剩余为 0
  const accumulatedBefore = 33250;
  const remaining = Math.round((totalDep - accumulatedBefore) * 100) / 100;
  assert.equal(remaining <= 0.004, true);
});
