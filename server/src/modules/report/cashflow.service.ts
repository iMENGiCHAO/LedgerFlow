import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BalanceService, periodSeq } from '../ledger/balance.service';
import { CASH_FLOW_ROWS, FlowRowDef } from '../../constants/cash-flow';
import { classifyVouchers, ClassifyEntry, UnmappedItem } from './cashflow-classify';

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface CashFlowRow {
  key: string;
  no: number;
  name: string;
  section: string;
  kind: string;
  periodValue: number;
  ytdValue: number;
  bold: boolean;
}

export { UnmappedItem };

export interface CashFlowReport {
  period: { year: number; month: number };
  rows: CashFlowRow[];
  beginCash: number;
  endCash: number;
  netIncrease: number;
  balanceCheck: { balanced: boolean; netIncrease: number; delta: number };
  unmapped: UnmappedItem[];
}

/**
 * 现金流量表(小企业会计准则表样,对方科目归集法):
 * - 现金及现金等价物:cashFlowType ∈ {CASH, BANK}(1001/1002)
 * - 现金↔现金内部转换不计流量
 * - 同凭证现金行金额按「对方科目行金额占对侧合计比例」分摊到对方科目,再映射到流量行
 * - 未映射科目落「其他经营」并记入 unmapped 明细
 */
@Injectable()
export class CashFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  async generate(tenantId: number, year: number, month: number): Promise<CashFlowReport> {
    if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new BadRequestException('期间参数不合法');
    const seq = periodSeq(year, month);
    const yearStartSeq = year * 12 + 1;

    const [periodEntries, ytdEntries, openBal, closeBal, subjects] = await Promise.all([
      this.fetchEntries(tenantId, seq, seq),
      this.fetchEntries(tenantId, yearStartSeq, seq),
      this.balance.computeBalances(tenantId, seq - 1),
      this.balance.computeBalances(tenantId, seq),
      this.prisma.subject.findMany({
        where: { tenantId, cashFlowType: { in: ['CASH', 'BANK'] } },
        select: { id: true, code: true, name: true, cashFlowType: true },
      }),
    ]);
    if (subjects.length === 0) throw new BadRequestException('未找到现金及银行科目,请检查科目表');

    const periodMap = classifyVouchers(periodEntries);
    const ytdMap = classifyVouchers(ytdEntries);
    const unmapped = [...periodMap.unmapped.values()].sort((a, b) => b.amount - a.amount);

    const values = new Map<string, { p: number; y: number }>();
    const rows: CashFlowRow[] = [];
    for (const def of CASH_FLOW_ROWS) {
      let p = 0;
      let y = 0;
      if (def.kind === 'inflow' || def.kind === 'outflow') {
        p = periodMap.rows.get(def.key) ?? 0;
        y = ytdMap.rows.get(def.key) ?? 0;
      } else if (def.compose && def.compose.length) {
        for (const k of def.compose) {
          p += values.get(k)?.p ?? 0;
          y += values.get(k)?.y ?? 0;
        }
      }
      if (def.kind === 'outflow') { p = -p; y = -y; }
      const val = { p: r2(p), y: r2(y) };
      values.set(def.key, val);
      rows.push({
        key: def.key,
        no: def.no,
        name: def.name,
        section: def.section,
        kind: def.kind,
        periodValue: val.p,
        ytdValue: val.y,
        bold: def.kind === 'subtotal' || def.kind === 'net' || def.key === 'f0432',
      });
    }

    // 期初/期末现金及现金等价物余额(按科目余额滚存)
    const sumCash = (m: Map<number, import('../ledger/balance.service').SubjectBalance>) => {
      let s = 0;
      for (const sub of subjects) {
        const b = m.get(sub.id);
        if (b) s += b.closeDebit - b.closeCredit;
      }
      return r2(s);
    };
    const beginCash = sumCash(openBal);
    const endCash = sumCash(closeBal);
    const netIncrease = values.get('f0430')?.p ?? 0;
    const delta = r2(netIncrease - (endCash - beginCash));

    return {
      period: { year, month },
      rows,
      beginCash,
      endCash,
      netIncrease,
      balanceCheck: { balanced: Math.abs(delta) < 0.01, netIncrease, delta },
      unmapped,
    };
  }

  private async fetchEntries(tenantId: number, fromSeq: number, toSeq: number): Promise<ClassifyEntry[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      { vid: number; subjectId: number; code: string; name: string; cashFlowType: string | null; debit: string; credit: string }[]
    >(
      `SELECT v.id AS vid, e."subjectId" AS "subjectId", s.code AS code, s.name AS name,
              s."cashFlowType" AS "cashFlowType", e.debit::text AS debit, e.credit::text AS credit
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       JOIN "Period" p ON p.id = v."periodId"
       JOIN "Subject" s ON s.id = e."subjectId"
       WHERE v."tenantId"=$1 AND v.status=2 AND (p.year*12+p.month)>=$2 AND (p.year*12+p.month)<=$3
       ORDER BY v.id ASC, e."lineNo" ASC`,
      tenantId,
      fromSeq,
      toSeq,
    );
    return rows.map((r) => ({
      vid: Number(r.vid),
      subjectId: Number(r.subjectId),
      code: r.code,
      name: r.name,
      cashFlowType: r.cashFlowType,
      debit: Number(r.debit),
      credit: Number(r.credit),
    }));
  }

}
