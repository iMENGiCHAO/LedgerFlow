import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export const periodSeq = (year: number, month: number) => year * 12 + month;

export interface SubjectBalance {
  subjectId: number;
  /** 期初借/贷余额(方向化前的原始借贷口径) */
  openDebit: number;
  openCredit: number;
  /** 本期发生 */
  debit: number;
  credit: number;
  /** 年累计发生 */
  ytdDebit: number;
  ytdCredit: number;
  /** 期末借/贷 */
  closeDebit: number;
  closeCredit: number;
}

export interface SubjectInfo {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  category: number;
  direction: 'D' | 'C';
  isLeaf: boolean;
  status: number;
  assist: { partner?: boolean; department?: boolean; project?: boolean } | null;
}

const n = (v: unknown) => Number(v ?? 0);

/**
 * 账务计算核心:基于「期初余额 + 已记账凭证分录」实时推导科目余额。
 * 无增量状态,天然幂等,红冲/反审核自动正确。
 */
@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async subjectsOf(tenantId: number): Promise<SubjectInfo[]> {
    const rows = await this.prisma.subject.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      parentId: r.parentId,
      category: r.category,
      direction: r.direction as 'D' | 'C',
      isLeaf: r.isLeaf,
      status: r.status,
      assist: (r.assist as SubjectInfo['assist']) ?? null,
    }));
  }

  /**
   * 计算某时点全部末级科目余额
   * @param endSeq 截止期间序列号(含)
   * @param startSeq 起始期间(含);缺省=期初至截止的累计区间为单期
   */
  async computeBalances(
    tenantId: number,
    endSeq: number,
    startSeq?: number,
    yearStartYear?: number,
  ): Promise<Map<number, SubjectBalance>> {
    const sSeq = startSeq ?? endSeq;
    const yStart = periodSeq(yearStartYear ?? Math.floor(sSeq / 12), 1);

    const agg = async (fromSeq: number | null, toSeq: number) => {
      const conds: string[] = ['v."tenantId" = $1', 'v.status = 2'];
      const params: unknown[] = [tenantId];
      if (fromSeq !== null) {
        params.push(fromSeq);
        conds.push(`(p.year * 12 + p.month) >= $${params.length}`);
      }
      params.push(toSeq);
      conds.push(`(p.year * 12 + p.month) <= $${params.length}`);
      const sql = `SELECT e."subjectId" AS sid, COALESCE(SUM(e.debit),0) AS d, COALESCE(SUM(e.credit),0) AS c
        FROM "VoucherEntry" e
        JOIN "Voucher" v ON v.id = e."voucherId"
        JOIN "Period" p ON p.id = v."periodId"
        WHERE ${conds.join(' AND ')}
        GROUP BY e."subjectId"`;
      const rows = await this.prisma.$queryRawUnsafe<{ sid: number; d: string; c: string }[]>(sql, ...params);
      const m = new Map<number, { d: number; c: number }>();
      for (const r of rows) m.set(Number(r.sid), { d: n(r.d), c: n(r.c) });
      return m;
    };

    const [cumulative, ytd, range] = await Promise.all([
      agg(null, endSeq),
      agg(yStart, endSeq),
      agg(sSeq, endSeq),
    ]);

    const initials = await this.prisma.initialBalance.groupBy({
      by: ['subjectId', 'direction'],
      where: { tenantId },
      _sum: { amount: true },
    });

    const result = new Map<number, SubjectBalance>();
    const touch = (sid: number): SubjectBalance => {
      let b = result.get(sid);
      if (!b) {
        b = {
          subjectId: sid,
          openDebit: 0,
          openCredit: 0,
          debit: 0,
          credit: 0,
          ytdDebit: 0,
          ytdCredit: 0,
          closeDebit: 0,
          closeCredit: 0,
        };
        result.set(sid, b);
      }
      return b;
    };

    for (const ini of initials) {
      const b = touch(ini.subjectId);
      if (ini.direction === 'D') b.openDebit += n(ini._sum.amount);
      else b.openCredit += n(ini._sum.amount);
    }
    // 期初 = 初始 + 截止(startSeq-1)累计发生
    const before = await agg(null, sSeq - 1);
    for (const [sid, v] of before) {
      const b = touch(sid);
      b.openDebit += v.d;
      b.openCredit += v.c;
    }

    for (const [sid, v] of range) {
      const b = touch(sid);
      b.debit = v.d;
      b.credit = v.c;
    }
    for (const [sid, v] of ytd) {
      const b = touch(sid);
      b.ytdDebit = v.d;
      b.ytdCredit = v.c;
    }
    for (const b of result.values()) {
      const net = b.openDebit - b.openCredit + b.debit - b.credit;
      if (net >= 0) {
        b.closeDebit = net;
        b.closeCredit = 0;
      } else {
        b.closeDebit = 0;
        b.closeCredit = -net;
      }
    }
    return result;
  }

  /** 按方向归一化的期末净额:D 科目返回 借-贷,C 科目返回 贷-借 */
  static naturalClose(b: SubjectBalance, direction: 'D' | 'C'): number {
    const net = b.closeDebit - b.closeCredit;
    return direction === 'D' ? net : -net;
  }

  static naturalOpen(b: SubjectBalance, direction: 'D' | 'C'): number {
    const net = b.openDebit - b.openCredit;
    return direction === 'D' ? net : -net;
  }
}
