import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { BizException, ERR } from '../../common/errors';
import { BalanceService, SubjectBalance, periodSeq } from './balance.service';
import { VoucherService } from './voucher.service';

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ChecklistItem {
  key: string;
  name: string;
  pass: boolean;
  blocking: boolean;
  detail?: string;
}

@Injectable()
export class ClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly vouchers: VoucherService,
  ) {}

  private async getPeriod(tenantId: number, periodId: number) {
    const p = await this.prisma.period.findFirst({ where: { id: periodId, tenantId } });
    if (!p) throw new BadRequestException('期间不存在');
    return p;
  }

  async checklist(tenantId: number, periodId: number): Promise<{ items: ChecklistItem[] }> {
    const period = await this.getPeriod(tenantId, periodId);
    const seq = periodSeq(period.year, period.month);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const isStartPeriod = period.year === tenant.startYear && period.month === tenant.startMonth;

    // 1. 上期已结账
    let prevPass = true;
    let prevDetail = '';
    if (!isStartPeriod) {
      const prev = await this.prisma.period.findUnique({
        where: {
          tenantId_year_month: {
            tenantId,
            year: period.month === 1 ? period.year - 1 : period.year,
            month: period.month === 1 ? 12 : period.month - 1,
          },
        },
      });
      prevPass = !!prev && prev.status === 2;
      prevDetail = prevPass ? '' : `上期 ${prev ? `${prev.year}-${String(prev.month).padStart(2, '0')}` : '(不存在)'} 未结账`;
    }

    // 2. 无草稿/待审核凭证
    const unfinished = await this.prisma.voucher.count({ where: { tenantId, periodId, status: { in: [0, 1] } } });

    // 3. 损益是否结转(净发生额分组是否清零)
    const plNet = await this.plActivityGroups(tenantId, period.id);
    const hasActivity = plNet.length > 0;

    // 4. 试算平衡
    const subjects = await this.balance.subjectsOf(tenantId);
    const balMap = await this.balance.computeBalances(tenantId, seq, seq);
    const ZERO: SubjectBalance = { subjectId: 0, openDebit: 0, openCredit: 0, debit: 0, credit: 0, ytdDebit: 0, ytdCredit: 0, closeDebit: 0, closeCredit: 0 };
    let sumD = 0;
    let sumC = 0;
    for (const s of subjects.filter((x) => x.isLeaf)) {
      const b = balMap.get(s.id) ?? ZERO;
      sumD += b.closeDebit;
      sumC += b.closeCredit;
    }
    const trialOk = Math.abs(sumD - sumC) < 0.01;

    const items: ChecklistItem[] = [
      { key: 'prev_closed', name: '上一会计期间已结账', pass: prevPass, blocking: true, detail: prevDetail },
      { key: 'no_pending_voucher', name: '无草稿及待审核凭证', pass: unfinished === 0, blocking: true, detail: unfinished > 0 ? `存在 ${unfinished} 张未处理凭证` : '' },
      {
        key: 'pl_carried',
        name: hasActivity ? '损益类科目已结转至本年利润' : '本期无损益发生额(无需结转)',
        pass: !hasActivity,
        blocking: true,
        detail: hasActivity ? `${plNet.length} 组损益科目未结转` : '',
      },
      {
        key: 'trial_balanced',
        name: '试算平衡(借方合计=贷方合计)',
        pass: trialOk,
        blocking: true,
        detail: trialOk ? `合计 ${r2(sumD).toFixed(2)}` : `借方 ${r2(sumD).toFixed(2)} ≠ 贷方 ${r2(sumC).toFixed(2)}`,
      },
    ];
    return { items };
  }

  /** 本期损益类科目净发生额非零的分组(排除结转凭证) */
  private async plActivityGroups(tenantId: number, periodId: number) {
    return this.prisma.$queryRawUnsafe<{ sid: number; cat: number; d: string; c: string }[]>(
      `SELECT e."subjectId" AS sid, s.category AS cat,
              COALESCE(SUM(e.debit),0)::text AS d, COALESCE(SUM(e.credit),0)::text AS c
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       JOIN "Subject" s ON s.id = e."subjectId"
       WHERE v."tenantId"=$1 AND v.status=2 AND v."sourceType" != 4
         AND v."periodId"=$2 AND s.category IN (5,6)
       GROUP BY e."subjectId", s.category
       HAVING COALESCE(SUM(e.debit),0) <> COALESCE(SUM(e.credit),0)`,
      tenantId,
      periodId,
    );
  }

  async close(tenantId: number, userId: number, periodId: number) {
    const { items } = await this.checklist(tenantId, periodId);
    const failed = items.filter((i) => i.blocking && !i.pass);
    if (failed.length > 0) {
      throw new BizException(ERR.CLOSING_CHECK_FAILED, `结账检查未通过:${failed.map((f) => f.name).join(';')}`);
    }
    const period = await this.getPeriod(tenantId, periodId);
    await this.ensureNextPeriod(tenantId, period.year, period.month);
    return this.prisma.period.update({
      where: { id: period.id },
      data: { status: 2, closedBy: userId, closedAt: new Date() },
    });
  }

  private async ensureNextPeriod(tenantId: number, year: number, month: number) {
    const ny = month === 12 ? year + 1 : year;
    const nm = month === 12 ? 1 : month + 1;
    const next = await this.prisma.period.findUnique({
      where: { tenantId_year_month: { tenantId, year: ny, month: nm } },
    });
    if (!next) {
      await this.prisma.period.create({ data: { tenantId, year: ny, month: nm, status: 1 } });
    }
    return this.prisma.period.findUniqueOrThrow({ where: { tenantId_year_month: { tenantId, year: ny, month: nm } } });
  }

  /** 反结账:下一期间必须无任何凭证(R10) */
  async unclose(tenantId: number, periodId: number) {
    const period = await this.getPeriod(tenantId, periodId);
    if (period.status !== 2) throw new BizException(ERR.VOUCHER_STATUS, '该期间尚未结账');
    const ny = period.month === 12 ? period.year + 1 : period.year;
    const nm = period.month === 12 ? 1 : period.month + 1;
    const next = await this.prisma.period.findUnique({
      where: { tenantId_year_month: { tenantId, year: ny, month: nm } },
      include: { _count: { select: { vouchers: true } } },
    });
    if (next && next._count.vouchers > 0) {
      throw new BizException(ERR.UNCLOSING_FORBIDDEN, `${ny}-${String(nm).padStart(2, '0')} 已存在凭证,不可反结账`);
    }
    return this.prisma.period.update({ where: { id: period.id }, data: { status: 1, closedBy: null, closedAt: null } });
  }

  /** 结转损益向导:按「科目+辅助核算」分组生成冲销分录,净额转入本年利润 */
  async profitCarryforward(tenantId: number, userId: number, periodId: number) {
    const period = await this.getPeriod(tenantId, periodId);
    if (period.status !== 1) throw new BizException(ERR.PERIOD_LOCKED, '仅进行中的期间可结转损益');
    const dup = await this.prisma.voucher.findFirst({
      where: { tenantId, periodId, sourceType: 4, status: { in: [0, 1, 2] } },
    });
    if (dup) throw new BizException(ERR.VOUCHER_STATUS, `本期已存在结转凭证(#${dup.id}),请先作废或红冲后再重新结转`);

    const subjects = await this.balance.subjectsOf(tenantId);
    type Group = { sid: number; cat: number; did: number | null; pid: number | null; prid: number | null; d: string; c: string };
    const groups = await this.prisma.$queryRawUnsafe<Group[]>(
      `SELECT e."subjectId" AS sid, s.category AS cat,
              e."departmentId" AS did, e."partnerId" AS pid, e."projectId" AS prid,
              COALESCE(SUM(e.debit),0)::text AS d, COALESCE(SUM(e.credit),0)::text AS c
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       JOIN "Period" p ON p.id = v."periodId"
       JOIN "Subject" s ON s.id = e."subjectId"
       WHERE v."tenantId"=$1 AND v.status=2 AND v."sourceType" != 4
         AND v."periodId"=$2 AND s.category IN (5,6)
       GROUP BY e."subjectId", s.category, e."departmentId", e."partnerId", e."projectId"
       HAVING COALESCE(SUM(e.debit),0) <> COALESCE(SUM(e.credit),0)`,
      tenantId,
      period.id,
    );

    type Entry = {
      summary: string;
      subjectId: number;
      debit: number;
      credit: number;
      departmentId?: number | null;
      partnerId?: number | null;
      projectId?: number | null;
    };
    const entries: Entry[] = [];
    let netProfit = 0;
    for (const g of groups) {
      const natural = g.cat === 5 ? r2(Number(g.c) - Number(g.d)) : r2(Number(g.d) - Number(g.c));
      if (Math.abs(natural) < 0.005) continue;
      const subjectName = subjects.find((x) => x.id === Number(g.sid))?.name ?? String(g.sid);
      if (g.cat === 5) {
        entries.push({ summary: `结转 ${subjectName}`, subjectId: Number(g.sid), debit: natural, credit: 0, departmentId: g.did, partnerId: g.pid, projectId: g.prid });
        netProfit += natural;
      } else {
        entries.push({ summary: `结转 ${subjectName}`, subjectId: Number(g.sid), debit: 0, credit: natural, departmentId: g.did, partnerId: g.pid, projectId: g.prid });
        netProfit -= natural;
      }
    }
    if (entries.length === 0) throw new BizException(ERR.PARAM, '本期无损益发生额,无需结转');

    const profitSubject = subjects.find((s) => s.code === '3103');
    if (!profitSubject) throw new BadRequestException('缺少 3103 本年利润科目');

    // 净额转入本年利润:借方富余(盈利)→ 贷记本年利润;反之借记(R15 平衡)
    const sumD = r2(entries.reduce((a, e) => a + e.debit, 0));
    const sumC = r2(entries.reduce((a, e) => a + e.credit, 0));
    const remain = r2(sumD - sumC);
    if (remain !== 0) {
      entries.push({
        summary: '结转本年利润',
        subjectId: profitSubject.id,
        debit: remain < 0 ? -remain : 0,
        credit: remain > 0 ? remain : 0,
      });
    }

    const lastDay = new Date(period.year, period.month, 0);
    const voucher = await this.vouchers.create(
      tenantId,
      userId,
      {
        word: '转',
        date: lastDay.toISOString().slice(0, 10),
        memo: `${period.year}-${String(period.month).padStart(2, '0')} 结转损益`,
        entries,
      },
      { submit: true, sourceType: 4 },
    );
    return { voucherId: voucher.id, netProfit: r2(netProfit) };
  }

  /** 计提折旧向导(平均年限法,R14):当月新增不提、当月减少照提、提足即停 */
  async depreciate(tenantId: number, userId: number, periodId: number) {
    const period = await this.getPeriod(tenantId, periodId);
    if (period.status !== 1) throw new BizException(ERR.PERIOD_LOCKED, '仅进行中的期间可计提折旧');
    const existed = await this.prisma.depreciationRecord.findFirst({ where: { tenantId, periodId } });
    if (existed) throw new BizException(ERR.DEP_DUPLICATED, '本期折旧已计提,如需重提请先删除对应凭证与记录');

    const monthEnd = new Date(period.year, period.month, 0);
    const assets = await this.prisma.fixedAsset.findMany({ where: { tenantId, status: 1 } });
    const lines: { assetId: number; depAmount: number; accumulatedDep: number; subjectId: number; deptId: number | null }[] = [];

    for (const a of assets) {
      if (a.acquiredDate > monthEnd) continue; // 当月新增次月起提
      const prevAccum = await this.prisma.depreciationRecord.aggregate({
        where: { assetId: a.id },
        _sum: { depAmount: true },
      });
      const accumulatedBefore = Number(prevAccum._sum.depAmount ?? 0);
      const totalDep = r2(Number(a.originalValue) * (1 - Number(a.salvageRate)));
      const remaining = r2(totalDep - accumulatedBefore);
      if (remaining <= 0.004) continue; // 已提足
      const monthly = r2(totalDep / a.lifeMonths);
      const depAmount = Math.min(monthly, remaining);
      lines.push({
        assetId: a.id,
        depAmount,
        accumulatedDep: r2(accumulatedBefore + depAmount),
        subjectId: a.depExpenseSubjectId,
        deptId: a.useDeptId ?? null,
      });
    }
    if (lines.length === 0) throw new BizException(ERR.PARAM, '没有需要计提折旧的资产');

    const subjects = await this.balance.subjectsOf(tenantId);
    const byExpense = new Map<number, { debit: number; deptId: number | null }>();
    for (const l of lines) {
      const cur = byExpense.get(l.subjectId) ?? { debit: 0, deptId: l.deptId };
      cur.debit = r2(cur.debit + l.depAmount);
      byExpense.set(l.subjectId, cur);
    }
    const accDepSubject = subjects.find((s) => s.code === '1602');
    if (!accDepSubject) throw new BadRequestException('缺少 1602 累计折旧科目');

    const entries = [...byExpense.entries()].map(([sidv, v]) => {
      const subj = subjects.find((x) => x.id === sidv);
      return { summary: `计提折旧(${subj?.name ?? sidv})`, subjectId: sidv, debit: v.debit, credit: 0, departmentId: v.deptId };
    });
    const total = r2(entries.reduce((a, e) => a + e.debit, 0));
    entries.push({ summary: '计提折旧', subjectId: accDepSubject.id, debit: 0, credit: total, departmentId: null });

    const lastDay = new Date(period.year, period.month, 0);
    const voucher = await this.vouchers.create(
      tenantId,
      userId,
      {
        word: '转',
        date: lastDay.toISOString().slice(0, 10),
        memo: `${period.year}-${String(period.month).padStart(2, '0')} 计提折旧`,
        entries,
      },
      { submit: true, sourceType: 3 },
    );
    await this.prisma.depreciationRecord.createMany({
      data: lines.map((l) => ({
        tenantId,
        periodId,
        assetId: l.assetId,
        depAmount: new Prisma.Decimal(l.depAmount.toFixed(2)),
        accumulatedDep: new Prisma.Decimal(l.accumulatedDep.toFixed(2)),
        voucherId: voucher.id,
      })),
    });
    return { voucherId: voucher.id, assetCount: lines.length, totalDepreciation: total };
  }
}
