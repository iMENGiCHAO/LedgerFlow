import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BalanceService, SubjectBalance, SubjectInfo, periodSeq } from '../ledger/balance.service';
import type { FormulaExpr } from '../../constants/report-formulas';

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ReportRow {
  rowKey: string;
  rowName: string;
  indent: number;
  bold: boolean;
  periodValue: number;
  ytdValue: number;
}

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  /** 按期间序列号解析截止时点;periodId 缺省取「不晚于当前日历月」的最晚已开启期间 */
  async resolveSeq(tenantId: number, periodId?: number): Promise<{ seq: number; year: number; month: number; periodId: number }> {
    if (periodId) {
      const p = await this.prisma.period.findFirst({ where: { id: periodId, tenantId } });
      if (!p) throw new BadRequestException('期间不存在');
      return { seq: periodSeq(p.year, p.month), year: p.year, month: p.month, periodId: p.id };
    }
    const now = new Date();
    const nowSeq = periodSeq(now.getFullYear(), now.getMonth() + 1);
    const candidates = await this.prisma.period.findMany({
      where: { tenantId, status: { in: [1, 2] }, ...(await this.prisma.period.count({ where: { tenantId, status: { in: [1, 2] }, year: { lte: now.getFullYear() } } }) > 0 ? { year: { lte: now.getFullYear() } } : {}) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 24,
    });
    const picked = candidates.find((p) => periodSeq(p.year, p.month) <= nowSeq) ?? candidates[candidates.length - 1];
    if (!picked) throw new BadRequestException('尚无可用会计期间');
    return { seq: periodSeq(picked.year, picked.month), year: picked.year, month: picked.month, periodId: picked.id };
  }

  private async evalFormula(
    expr: FormulaExpr,
    balMap: Map<number, SubjectBalance>,
    subjects: SubjectInfo[],
    rowValues: Map<string, { p: number; y: number }>,
    colMode: 'period' | 'ytd',
    subjectActivity?: Map<number, { d: number; c: number }>,
  ): Promise<number> {
    const dirOf = new Map(subjects.map((s) => [s.id, s.direction]));
    // 前缀展开:公式编码匹配其自身及全部下级叶子科目(如 '1002' 覆盖 '100201')
    const leaves = subjects.filter((s) => s.isLeaf);
    const expand = (codes: string[]): typeof leaves =>
      leaves.filter((s) => codes.some((c) => s.code === c || s.code.startsWith(c)));
    switch (expr.t) {
      case 'bal': {
        let sum = 0;
        for (const term of expr.terms) {
          for (const code of term.s) {
            if (code === '@pl') {
              // 未结转损益:收入自然余额 − 费用自然余额(已结转月份净额为 0)
              for (const s of leaves) {
                if (s.category !== 5 && s.category !== 6) continue;
                const b = balMap.get(s.id);
                if (!b) continue;
                const dir = dirOf.get(s.id) ?? 'D';
                const net = b.closeDebit - b.closeCredit;
                const signed = s.category === 5 ? (dir === 'C' ? -net : net) : -(dir === 'D' ? net : -net);
                sum += term.coef * signed;
              }
              continue;
            }
            for (const s of expand([code])) {
              const b = balMap.get(s.id);
              if (!b) continue;
              const dir = dirOf.get(s.id) ?? 'D';
              const net = b.closeDebit - b.closeCredit;
              sum += term.coef * (dir === 'D' ? net : -net);
            }
          }
        }
        return r2(sum);
      }
      case 'act': {
        let sum = 0;
        for (const s of expand(expr.s)) {
          const a = subjectActivity?.get(s.id);
          if (!a) continue;
          sum += expr.side === 'D' ? a.d - a.c : a.c - a.d;
        }
        return r2(sum);
      }
      case 'rows': {
        let sum = 0;
        for (const item of expr.items) {
          const v = rowValues.get(item.key);
          sum += item.coef * (colMode === 'period' ? (v?.p ?? 0) : (v?.y ?? 0));
        }
        return r2(sum);
      }
      default:
        return 0;
    }
  }

  /**
   * 报表引擎
   * @param reportCode BS / IS
   * @param endSeq 截止期间序列
   * @param startSeq 本期起始(默认=endSeq 单期)
   */
  async buildReport(tenantId: number, reportCode: 'BS' | 'IS', endSeq: number, startSeqIn?: number) {
    const startSeq = startSeqIn ?? endSeq;
    const [formulas, subjects] = await Promise.all([
      this.prisma.reportFormula.findMany({ where: { reportCode }, orderBy: { sort: 'asc' } }),
      this.balance.subjectsOf(tenantId),
    ]);

    // 资产负债表用余额(截至 endSeq);利润表需要发生额(区间 + 年初至今)
    const balMap =
      reportCode === 'BS'
        ? await this.balance.computeBalances(tenantId, endSeq)
        : await this.balance.computeBalances(tenantId, endSeq, startSeq);

    // 发生额(用于 IS act 公式)
    const rangeAgg = await this.activityBySubject(tenantId, startSeq, endSeq);
    const ytdYear = Math.floor(endSeq / 12);
    const ytdAgg = await this.activityBySubject(tenantId, periodSeq(ytdYear, 1), endSeq);

    const rowValues = new Map<string, { p: number; y: number }>();
    const rows: ReportRow[] = [];

    // 先计算叶子公式行(bal/act),再算 rows 组合行
    const leafRows = formulas.filter((f) => (f.expr as unknown as FormulaExpr).t !== 'rows');
    const comboRows = formulas.filter((f) => (f.expr as unknown as FormulaExpr).t === 'rows');

    for (const f of leafRows) {
      const expr = f.expr as unknown as FormulaExpr;
      const pv = await this.evalFormula(expr, balMap, subjects, rowValues, 'period', rangeAgg);
      const yv = await this.evalFormula(expr, balMap, subjects, rowValues, 'ytd', ytdAgg);
      rowValues.set(f.rowKey, { p: pv, y: yv });
      rows.push({ rowKey: f.rowKey, rowName: f.rowName, indent: f.indent, bold: f.bold, periodValue: pv, ytdValue: yv });
    }
    for (const f of comboRows) {
      const expr = f.expr as unknown as FormulaExpr;
      const pv = await this.evalFormula(expr, balMap, subjects, rowValues, 'period');
      const yv = await this.evalFormula(expr, balMap, subjects, rowValues, 'ytd');
      rowValues.set(f.rowKey, { p: pv, y: yv });
      rows.push({ rowKey: f.rowKey, rowName: f.rowName, indent: f.indent, bold: f.bold, periodValue: pv, ytdValue: yv });
    }

    rows.sort((a, b) => {
      const fa = formulas.find((f) => f.rowKey === a.rowKey)!;
      const fb = formulas.find((f) => f.rowKey === b.rowKey)!;
      return fa.sort - fb.sort;
    });

    // 平衡校验(BS)
    let balanceCheck: { balanced: boolean; asset: number; liabilityEquity: number } | null = null;
    if (reportCode === 'BS') {
      const asset = rowValues.get('total_asset')?.p ?? 0;
      const le = rowValues.get('total_le')?.p ?? 0;
      balanceCheck = { balanced: Math.abs(asset - le) < 0.01, asset, liabilityEquity: le };
    }
    return { rows, balanceCheck };
  }

  private async activityBySubject(tenantId: number, fromSeq: number, toSeq: number) {
    // 排除结转损益凭证(sourceType=4),保证利润表发生额口径为真实业务发生额
    const rows = await this.prisma.$queryRawUnsafe<{ sid: number; d: string; c: string }[]>(
      `SELECT e."subjectId" AS sid, COALESCE(SUM(e.debit),0) AS d, COALESCE(SUM(e.credit),0) AS c
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       JOIN "Period" p ON p.id = v."periodId"
       WHERE v."tenantId"=$1 AND v.status=2 AND v."sourceType" != 4 AND (p.year*12+p.month)>=$2 AND (p.year*12+p.month)<=$3
       GROUP BY e."subjectId"`,
      tenantId,
      fromSeq,
      toSeq,
    );
    const m = new Map<number, { d: number; c: number }>();
    for (const r of rows) m.set(Number(r.sid), { d: Number(r.d), c: Number(r.c) });
    return m;
  }

  /** 总分类账/科目余额表 */
  async balanceSummary(tenantId: number, year: number, month: number, opts: { level?: number } = {}) {
    const seq = periodSeq(year, month);
    const [subjects, bal] = await Promise.all([
      this.balance.subjectsOf(tenantId),
      this.balance.computeBalances(tenantId, seq),
    ]);
    const list = subjects
      .filter((s) => s.isLeaf)
      .map((s) => {
        const b: SubjectBalance = bal.get(s.id) ?? {
          subjectId: s.id,
          openDebit: 0,
          openCredit: 0,
          debit: 0,
          credit: 0,
          ytdDebit: 0,
          ytdCredit: 0,
          closeDebit: 0,
          closeCredit: 0,
        };
        return {
          subjectId: s.id,
          code: s.code,
          name: s.name,
          category: s.category,
          direction: s.direction,
          openDebit: b.openDebit,
          openCredit: b.openCredit,
          debit: b.debit,
          credit: b.credit,
          ytdDebit: b.ytdDebit,
          ytdCredit: b.ytdCredit,
          closeDebit: b.closeDebit,
          closeCredit: b.closeCredit,
        };
      })
      .filter((r) => {
        if (!opts.level) return true;
        return r.code.length <= opts.level * 2 + 2;
      });
    const totals = list.reduce(
      (a, r) => ({
        openDebit: r2(a.openDebit + r.openDebit),
        openCredit: r2(a.openCredit + r.openCredit),
        debit: r2(a.debit + r.debit),
        credit: r2(a.credit + r.credit),
        closeDebit: r2(a.closeDebit + r.closeDebit),
        closeCredit: r2(a.closeCredit + r.closeCredit),
      }),
      { openDebit: 0, openCredit: 0, debit: 0, credit: 0, closeDebit: 0, closeCredit: 0 },
    );
    return { list, totals };
  }

  /** 明细分类账:某末级科目的逐笔序时账 */
  async detailLedger(
    tenantId: number,
    subjectId: number,
    year: number,
    monthFrom: number,
    monthTo: number,
  ) {
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, tenantId } });
    if (!subject) throw new BadRequestException('科目不存在');

    const startSeq = periodSeq(year, monthFrom);
    const endSeq = periodSeq(year, monthTo);
    const bal = await this.balance.computeBalances(tenantId, startSeq - 1);
    const b = bal.get(subjectId);
    let running = b ? b.closeDebit - b.closeCredit : 0;

    const entries = await this.prisma.$queryRawUnsafe<
      {
        vid: number; no: number; word: string; date: Date; line_no: number; summary: string;
        debit: string; credit: string; partner_name: string | null;
      }[]
    >(
      `SELECT v.id AS vid, v.no, v.word, v.date, e."lineNo", e.summary, e.debit::text AS debit, e.credit::text AS credit,
              pt.name AS partner_name
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       JOIN "Period" p ON p.id = v."periodId"
       LEFT JOIN "Partner" pt ON pt.id = e."partnerId"
       WHERE v."tenantId"=$1 AND v.status=2 AND e."subjectId"=$2
         AND (p.year*12+p.month)>=$3 AND (p.year*12+p.month)<=$4
       ORDER BY v.date ASC, v.no ASC, e."lineNo" ASC`,
      tenantId,
      subjectId,
      startSeq,
      endSeq,
    );

    let periodD = 0;
    let periodC = 0;
    const lines = entries.map((e) => {
      const d = Number(e.debit);
      const c = Number(e.credit);
      periodD += d;
      periodC += c;
      running += d - c;
      return {
        voucherId: e.vid,
        word: e.word,
        no: e.no,
        date: e.date,
        summary: e.summary,
        partnerName: e.partner_name,
        debit: d,
        credit: c,
        direction: d > 0 ? '借' : '贷',
        balance: r2(Math.abs(running)),
        balanceSide: running >= 0 ? '借' : '贷',
      };
    });
    const openingNet = b ? b.closeDebit - b.closeCredit : 0;
    return {
      subject: { id: subject.id, code: subject.code, name: subject.name, direction: subject.direction },
      opening: { amount: r2(Math.abs(openingNet)), side: openingNet >= 0 ? '借' : '贷' },
      lines,
      totals: { debit: r2(periodD), credit: r2(periodC) },
      closing: { amount: r2(Math.abs(running)), side: running >= 0 ? '借' : '贷' },
    };
  }
}
