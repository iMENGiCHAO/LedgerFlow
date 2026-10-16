/**
 * 现金流量归集(纯函数,与 cashflow.service 同源)
 *
 * 对方科目法:
 *  - 现金及现金等价物行(cashFlowType ∈ {CASH, BANK})按同凭证「对方科目」归集
 *  - 现金 ↔ 现金内部转换(提现/存现/银行互转)不计流量
 *  - 同凭证现金行金额按对方科目行金额占对侧合计比例分摊
 *  - 未映射对方科目落「其他经营」行并计入 unmapped 明细
 */
import { COUNTER_FLOW_MAP, FALLBACK_INFLOW, FALLBACK_OUTFLOW } from '../../constants/cash-flow';

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ClassifyEntry {
  vid: number;
  subjectId: number;
  code: string;
  name: string;
  cashFlowType: string | null;
  debit: number;
  credit: number;
}

export interface UnmappedItem {
  code: string;
  name: string;
  amount: number;
  direction: 'inflow' | 'outflow';
}

/** 最长前缀匹配:对方科目编码 → 流量行 */
export function matchFlowRow(code: string): { inflow?: string; outflow?: string } {
  let best: { inflow?: string; outflow?: string } | null = null;
  let bestLen = 0;
  for (const m of COUNTER_FLOW_MAP) {
    if (code.startsWith(m.prefix) && m.prefix.length > bestLen) {
      best = m;
      bestLen = m.prefix.length;
    }
  }
  return best ?? {};
}

export function classifyVouchers(entries: ClassifyEntry[]): {
  rows: Map<string, number>;
  unmapped: Map<string, UnmappedItem>;
} {
  const rows = new Map<string, number>();
  const unmapped = new Map<string, UnmappedItem>();
  const add = (key: string, amount: number) => rows.set(key, r2((rows.get(key) ?? 0) + amount));

  const byVoucher = new Map<number, ClassifyEntry[]>();
  for (const e of entries) {
    if (!byVoucher.has(e.vid)) byVoucher.set(e.vid, []);
    byVoucher.get(e.vid)!.push(e);
  }

  for (const lines of byVoucher.values()) {
    const cashLines = lines.filter((l) => l.cashFlowType === 'CASH' || l.cashFlowType === 'BANK');
    if (cashLines.length === 0) continue;
    const others = lines.filter((l) => l.cashFlowType !== 'CASH' && l.cashFlowType !== 'BANK');
    // 全部为现金间转换(提现/存现/银行互转):不计入流量
    if (others.length === 0) continue;

    const inflowTotal = cashLines.reduce((s, l) => s + l.debit, 0);
    const outflowTotal = cashLines.reduce((s, l) => s + l.credit, 0);
    const otherInSum = others.reduce((s, l) => s + l.credit, 0);
    const otherOutSum = others.reduce((s, l) => s + l.debit, 0);

    for (const o of others) {
      if (o.credit > 0 && inflowTotal > 0) {
        const amount = inflowTotal >= otherInSum ? o.credit : r2(inflowTotal * (o.credit / (otherInSum || 1)));
        assignEntry(add, unmapped, o, 'inflow', amount);
      }
      if (o.debit > 0 && outflowTotal > 0) {
        const amount = outflowTotal >= otherOutSum ? o.debit : r2(outflowTotal * (o.debit / (otherOutSum || 1)));
        assignEntry(add, unmapped, o, 'outflow', amount);
      }
    }
  }
  return { rows, unmapped };
}

function assignEntry(
  add: (key: string, amount: number) => void,
  unmapped: Map<string, UnmappedItem>,
  other: ClassifyEntry,
  direction: 'inflow' | 'outflow',
  amount: number,
) {
  if (amount === 0) return;
  const m = matchFlowRow(other.code);
  const rowKey = direction === 'inflow' ? m.inflow : m.outflow;
  if (rowKey) {
    add(rowKey, amount);
  } else {
    add(direction === 'inflow' ? FALLBACK_INFLOW : FALLBACK_OUTFLOW, amount);
    const k = `${other.code}:${direction}`;
    const prev = unmapped.get(k);
    unmapped.set(k, {
      code: other.code,
      name: other.name,
      amount: r2((prev?.amount ?? 0) + amount),
      direction,
    });
  }
}
