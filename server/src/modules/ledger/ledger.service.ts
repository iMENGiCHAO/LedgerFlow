import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BizException, ERR } from '../../common/errors';
import { BalanceService } from './balance.service';
import { TenantSetupService } from './tenant-setup.service';

export interface InitialItem {
  subjectCode: string;
  partnerCode?: string;
  departmentCode?: string;
  projectCode?: string;
  direction: 'D' | 'C';
  amount: number;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly setup: TenantSetupService,
  ) {}

  async periods(tenantId: number) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    let rows = await this.prisma.period.findMany({ where: { tenantId }, orderBy: [{ year: 'asc' }, { month: 'asc' }] });
    if (rows.length === 0) {
      await this.setup.ensurePeriods(tenantId);
      rows = await this.prisma.period.findMany({ where: { tenantId }, orderBy: [{ year: 'asc' }, { month: 'asc' }] });
    }
    return { tenantStatus: tenant.status, startYear: tenant.startYear, startMonth: tenant.startMonth, list: rows };
  }

  /** 期初余额视图:全部末级科目 + 已录金额 */
  async initialBalances(tenantId: number) {
    const [subjects, rows] = await Promise.all([
      this.balance.subjectsOf(tenantId),
      this.prisma.initialBalance.findMany({ where: { tenantId }, include: { partner: { select: { code: true, name: true } } } }),
    ]);
    const leaves = subjects.filter((s) => s.isLeaf);
    const bySubject = new Map<number, { direction: 'D' | 'C'; amount: number; partnerId?: number | null }[]>();
    for (const r of rows) {
      const arr = bySubject.get(r.subjectId) ?? [];
      arr.push({ direction: r.direction as 'D' | 'C', amount: Number(r.amount), partnerId: r.partnerId });
      bySubject.set(r.subjectId, arr);
    }
    const sumD = rows.filter((r) => r.direction === 'D').reduce((a, r) => a + Number(r.amount), 0);
    const sumC = rows.filter((r) => r.direction === 'C').reduce((a, r) => a + Number(r.amount), 0);
    return {
      list: leaves.map((s) => ({
        subjectId: s.id,
        code: s.code,
        name: s.name,
        category: s.category,
        direction: s.direction,
        assist: s.assist,
        balances: bySubject.get(s.id) ?? [],
      })),
      totalDebit: Math.round(sumD * 100) / 100,
      totalCredit: Math.round(sumC * 100) / 100,
      balanced: Math.abs(sumD - sumC) < 0.01 && sumD > 0,
    };
  }

  /** 整体替换期初余额(仅账套未启用时) */
  async saveInitialBalances(
    tenantId: number,
    items: InitialItem[],
  ): Promise<{ saved: number }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.status !== 0) throw new BizException(ERR.PERIOD_LOCKED, '账套已启用,期初余额不可修改(请使用凭证调整)');

    const [subjects, partners, departments, projects] = await Promise.all([
      this.balance.subjectsOf(tenantId),
      this.prisma.partner.findMany({ where: { tenantId } }),
      this.prisma.department.findMany({ where: { tenantId } }),
      this.prisma.project.findMany({ where: { tenantId } }),
    ]);
    const sMap = new Map(subjects.map((s) => [s.code, s]));
    const pMap = new Map(partners.map((p) => [p.code, p.id]));

    await this.prisma.$transaction(async (tx) => {
      await tx.initialBalance.deleteMany({ where: { tenantId } });
      const data = items
        .filter((i) => i.amount !== 0 && Number.isFinite(i.amount))
        .map((i) => {
          const subject = sMap.get(i.subjectCode);
          if (!subject) throw new BadRequestException(`科目 ${i.subjectCode} 不存在`);
          if (!subject.isLeaf) throw new BadRequestException(`科目 ${i.subjectCode} 不是末级科目`);
          return {
            tenantId,
            subjectId: subject.id,
            partnerId: i.partnerCode ? pMap.get(i.partnerCode) ?? null : null,
            direction: i.direction,
            amount: Math.round(Number(i.amount) * 100) / 100,
          };
        });
      if (data.length > 0) await tx.initialBalance.createMany({ data });
    });

    // 同步更新银行账户期初(若存在对应账户)
    return { saved: items.filter((i) => i.amount !== 0).length };
  }

  /** 启用账套:校验试算平衡 → 预置科目/期间 → 状态置为已启用 */
  async activateTenant(tenantId: number): Promise<{ ok: true }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (tenant.status !== 0) return { ok: true };

    const rows = await this.prisma.initialBalance.groupBy({
      by: ['direction'],
      where: { tenantId },
      _sum: { amount: true },
    });
    const sumD = Number(rows.find((r) => r.direction === 'D')?._sum.amount ?? 0);
    const sumC = Number(rows.find((r) => r.direction === 'C')?._sum.amount ?? 0);
    if (Math.abs(sumD - sumC) >= 0.01 || sumD <= 0) {
      throw new BizException(ERR.TRIAL_UNBALANCED, `期初不平衡或为零:借方 ${sumD.toFixed(2)} ≠ 贷方 ${sumC.toFixed(2)}`);
    }
    await this.setup.seedSubjects(tenantId);
    await this.setup.ensurePeriods(tenantId);
    const startP = await this.prisma.period.findUniqueOrThrow({
      where: { tenantId_year_month: { tenantId, year: tenant.startYear, month: tenant.startMonth } },
    });
    if (startP.status === 0) {
      await this.prisma.period.update({ where: { id: startP.id }, data: { status: 1 } });
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { status: 1 } });
    return { ok: true };
  }
}
