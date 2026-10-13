import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BalanceService, periodSeq } from '../ledger/balance.service';
import { ReportService } from '../report/report.service';

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 看板缓存(30 秒,key=tenantId) - 单进程内存版 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<number, { ts: number; data: unknown }>();

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly reports: ReportService,
  ) {}

  async summary(tenantId: number) {
    const now = new Date();
    // 看板默认展示「最近有记账数据的期间」(演示与真实使用都更直观),无数据时回退当前期间
    const lastActive = await this.prisma.voucher.findFirst({
      where: { tenantId, status: 2 },
      orderBy: { date: 'desc' },
      include: { period: true },
    });
    const cur = await this.reports.resolveSeq(
      tenantId,
      lastActive ? await this.prisma.period.findFirst({ where: { id: lastActive.periodId } }).then((x) => x?.id) : undefined,
    );

    // 资金头寸
    const balMap = await this.balance.computeBalances(tenantId, cur.seq);
    const subjects = await this.balance.subjectsOf(tenantId);
    const cashSubjects = subjects.filter((s) => ['1001', '1002', '1012'].some((c) => s.code.startsWith(c)));
    const cashSubjectIds = new Set(cashSubjects.map((s) => s.id));
    const cash = r2([...balMap.entries()].filter(([sid]) => cashSubjectIds.has(sid)).reduce((a, [, b]) => a + b.closeDebit - b.closeCredit, 0));

    // 往来
    const bills = await this.prisma.arapBill.findMany({ where: { tenantId, type: { in: [1, 3] } } });
    let arOutstanding = 0;
    let arOverdue = 0;
    let apOutstanding = 0;
    for (const b of bills) {
      const out = Number(b.amount) - Number(b.writtenOff);
      if (out <= 0.004) continue;
      if (b.type === 1) {
        arOutstanding += out;
        if (b.dueDate && new Date(b.dueDate) < now) arOverdue += out;
      } else {
        apOutstanding += out;
      }
    }

    // 本期利润表(最近期间)
    const isReport = await this.reports.buildReport(tenantId, 'IS', cur.seq);
    const rowMap = new Map(isReport.rows.map((r) => [r.rowKey, r]));
    const revenue = rowMap.get('revenue')?.periodValue ?? 0;
    const cost = (rowMap.get('cogs')?.periodValue ?? 0) + (rowMap.get('tax_surcharge')?.periodValue ?? 0);
    const expenses =
      (rowMap.get('selling')?.periodValue ?? 0) + (rowMap.get('admin')?.periodValue ?? 0) + (rowMap.get('finance')?.periodValue ?? 0);
    const netProfit = rowMap.get('net_profit')?.periodValue ?? 0;

    // 近12月趋势
    const trendRows = await this.prisma.$queryRawUnsafe<{ y: number; m: number; rev: string; exp: string }[]>(
      `SELECT p.year AS y, p.month AS m,
              COALESCE(SUM(CASE WHEN s.category=5 THEN e.credit - e.debit ELSE 0 END),0)::text AS rev,
              COALESCE(SUM(CASE WHEN s.category=6 THEN e.debit - e.credit ELSE 0 END),0)::text AS exp
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       JOIN "Period" p ON p.id = v."periodId"
       JOIN "Subject" s ON s.id = e."subjectId"
       WHERE v."tenantId"=$1 AND v.status=2 AND s.category IN (5,6)
         AND (p.year*12+p.month) >= $2
       GROUP BY p.year, p.month
       ORDER BY p.year, p.month`,
      tenantId,
      periodSeq(now.getFullYear(), now.getMonth() + 1) - 11,
    );
    const trend = trendRows.map((r) => ({
      month: `${r.y}-${String(r.m).padStart(2, '0')}`,
      revenue: r2(Number(r.rev)),
      expense: r2(Number(r.exp)),
      profit: r2(Number(r.rev) - Number(r.exp)),
    }));

    // TOP5 费用科目(本期)
    const expenseSubjects = (await this.balance.subjectsOf(tenantId)).filter((s) => s.isLeaf && s.category === 6);
    const topExpenses = expenseSubjects
      .map((s) => {
        const b = balMap.get(s.id);
        return { name: s.name, amount: b ? r2(b.debit - b.credit) : 0 };
      })
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 待办统计
    const [pendingVouchers, pendingClaims] = await Promise.all([
      this.prisma.voucher.count({ where: { tenantId, status: 1 } }),
      this.prisma.expenseClaim.count({ where: { tenantId, status: { in: [1, 2, 3, 4] } } }),
    ]);

    return {
      asOf: `${cur.year}-${String(cur.month).padStart(2, '0')}`,
      cashPosition: cash,
      receivable: { outstanding: r2(arOutstanding), overdue: r2(arOverdue) },
      payable: { outstanding: r2(apOutstanding) },
      currentPeriod: { revenue, cost: r2(cost), expenses: r2(expenses), netProfit },
      trend,
      topExpenses,
      todos: { pendingVouchers, pendingClaims },
      balanceCheck: isReport.balanceCheck,
    };
  }

  /** 带缓存的 summary(30 秒内直接返回,凭证明细/报销流变更后自动失效) */
  async summaryCached(tenantId: number) {
    const now = Date.now();
    const c = cache.get(tenantId);
    if (c && now - c.ts < CACHE_TTL_MS) return { ...(c.data as object), _cached: true };
    const data = await this.summary(tenantId);
    cache.set(tenantId, { ts: now, data });
    return { ...data, _cached: false };
  }

  /** 主动失效缓存(凭证审核/报销状态变更后调用) */
  static invalidate(tenantId: number) {
    cache.delete(tenantId);
  }
}
