import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BalanceService } from '../ledger/balance.service';
import { VoucherService } from '../ledger/voucher.service';

const r2 = (x: number) => Math.round(x * 100) / 100;

@Injectable()
export class AssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
    private readonly vouchers: VoucherService,
  ) {}

  private async nextCardNo(tenantId: number): Promise<string> {
    const agg = await this.prisma.fixedAsset.aggregate({
      where: { tenantId },
      _max: { cardNo: true },
    });
    const seq = agg._max.cardNo ? Number(agg._max.cardNo.replace('FA-', '')) + 1 : 1;
    return `FA-${String(seq).padStart(5, '0')}`;
  }

  async list(tenantId: number, q: { keyword?: string; status?: number }) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.keyword ? { OR: [{ name: { contains: q.keyword } }, { cardNo: { contains: q.keyword } }] } : {}),
      },
      include: { useDept: { select: { name: true } }, depExpenseSubject: { select: { code: true, name: true } } },
      orderBy: { id: 'asc' },
    });
    const depAgg = await this.prisma.depreciationRecord.groupBy({
      by: ['assetId'],
      where: { tenantId },
      _sum: { depAmount: true },
    });
    const depMap = new Map(depAgg.map((d) => [d.assetId, Number(d._sum.depAmount ?? 0)]));
    return {
      list: assets.map((a) => {
        const totalDep = r2(Number(a.originalValue) * (1 - Number(a.salvageRate)));
        const accumulated = r2(depMap.get(a.id) ?? 0);
        return {
          ...a,
          monthlyDepreciation: a.status === 1 ? r2(Math.min(totalDep / a.lifeMonths, Math.max(0, totalDep - accumulated))) : 0,
          totalDepreciation: totalDep,
          accumulatedDepreciation: accumulated,
          netValue: r2(Number(a.originalValue) - accumulated),
          fullyDepreciated: accumulated >= totalDep - 0.004,
        };
      }),
    };
  }

  /** 导出 */
  async listAll(tenantId: number, q: { keyword?: string; status?: number }) {
    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.keyword ? { OR: [{ name: { contains: q.keyword } }, { cardNo: { contains: q.keyword } }] } : {}),
      },
      include: { useDept: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });
    const depAgg = await this.prisma.depreciationRecord.groupBy({
      by: ['assetId'],
      where: { tenantId },
      _sum: { depAmount: true },
    });
    const depMap = new Map(depAgg.map((d) => [d.assetId, Number(d._sum.depAmount ?? 0)]));
    return assets.map((a) => ({
      ...a,
      depreciation: depMap.get(a.id) ?? 0,
      netValue: r2(Number(a.originalValue) - (depMap.get(a.id) ?? 0)),
    }));
  }

  async create(
    tenantId: number,
    userId: number,
    dto: {
      name: string;
      category: string;
      acquiredDate: string;
      originalValue: number;
      salvageRate?: number;
      lifeMonths: number;
      useDeptId?: number;
      location?: string;
      depExpenseSubjectCode?: string;
      generateVoucher?: boolean;
    },
  ) {
    const subjects = await this.balance.subjectsOf(tenantId);
    const faSubject = subjects.find((s) => s.code === '1601');
    if (!faSubject) throw new BadRequestException('缺少 1601 固定资产科目');
    let expenseSubject = subjects.find((s) => s.isLeaf && s.code === (dto.depExpenseSubjectCode ?? '560205'));
    if (!expenseSubject) {
      const fallback = subjects.find((s) => s.isLeaf && s.code === '560201');
      if (!fallback) throw new BadRequestException('缺少可用的折旧费用明细科目(建议在管理费用下增设「折旧费」)');
      expenseSubject = fallback;
    }

    // 折旧费用科目支持明细(如 560102 折旧费),未指定时用一级
    const candidates = subjects.filter((s) => s.isLeaf && s.code.startsWith('5602'));
    if (candidates.length > 0 && !dto.depExpenseSubjectCode) {
      const detail = candidates.find((c) => c.name.includes('折旧'));
      if (detail) expenseSubject = detail;
    }

    const cardNo = await this.nextCardNo(tenantId);
    const value = r2(Number(dto.originalValue));
    if (!(value > 0)) throw new BadRequestException('原值必须大于零');
    if (dto.lifeMonths <= 0) throw new BadRequestException('使用年限必须大于零');

    let acquireVoucherId: number | null = null;
    if (dto.generateVoucher !== false) {
      const bankSubject = subjects.find((s) => s.code.startsWith('1002'));
      const v = await this.vouchers.create(
        tenantId,
        userId,
        {
          word: '转',
          date: dto.acquiredDate,
          memo: `购置固定资产-${dto.name}`,
          entries: [
            { summary: `购置 ${dto.name}`, subjectId: faSubject.id, debit: value, credit: 0 },
            { summary: `购置 ${dto.name}`, subjectId: bankSubject?.id ?? faSubject.id, debit: 0, credit: value },
          ],
        },
        { submit: true, sourceType: 0 },
      );
      acquireVoucherId = v.id;
    }

    return this.prisma.fixedAsset.create({
      data: {
        tenantId,
        cardNo,
        name: dto.name,
        category: dto.category,
        acquiredDate: new Date(dto.acquiredDate),
        originalValue: value,
        salvageRate: dto.salvageRate ?? 0.05,
        lifeMonths: dto.lifeMonths,
        useDeptId: dto.useDeptId,
        location: dto.location,
        depExpenseSubjectId: expenseSubject.id,
        acquireVoucherId,
        createdBy: userId,
      },
    });
  }

  async update(
    tenantId: number,
    id: number,
    dto: { name?: string; category?: string; useDeptId?: number; location?: string; status?: number; lifeMonths?: number },
  ) {
    return this.prisma.fixedAsset.updateMany({ where: { id, tenantId }, data: dto });
  }

  /** 资产处置(出售/报废),生成清理凭证 */
  async dispose(
    tenantId: number,
    userId: number,
    id: number,
    dto: { disposeDate: string; disposeType: string; disposeAmount?: number; settleSubjectCode?: string },
  ) {
    const asset = await this.prisma.fixedAsset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new BadRequestException('资产不存在');
    if (asset.status !== 1) throw new BadRequestException('资产已处置或清理中');

    const [subjects, depAgg] = await Promise.all([
      this.balance.subjectsOf(tenantId),
      this.prisma.depreciationRecord.aggregate({ where: { assetId: id }, _sum: { depAmount: true } }),
    ]);
    const fa = subjects.find((s) => s.code === '1601')!;
    const accDep = subjects.find((s) => s.code === '1602')!;
    const liquidation = subjects.find((s) => s.code === '1606')!;
    const nonOpIncome = subjects.find((s) => s.code === '5201');
    const nonOpExpense = subjects.find((s) => s.code === '5711');

    const original = r2(Number(asset.originalValue));
    const accumulated = r2(Number(depAgg._sum.depAmount ?? 0));
    const net = r2(original - accumulated);
    const proceeds = dto.disposeAmount ? r2(dto.disposeAmount) : 0;

    type E = { summary: string; subjectId: number; debit: number; credit: number };
    const entries: E[] = [
      { summary: `${dto.disposeType}转销累计折旧`, subjectId: accDep.id, debit: accumulated, credit: 0 },
      { summary: `${dto.disposeType} ${asset.name}`, subjectId: liquidation.id, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 },
      { summary: `${dto.disposeType}转销原值`, subjectId: fa.id, debit: 0, credit: original },
    ];
    if (proceeds > 0) {
      const bank = subjects.find((s) => s.code === (dto.settleSubjectCode || '100201')) ?? subjects.find((s) => s.code.startsWith('1002'));
      if (!bank) throw new BadRequestException('缺少银行存款科目');
      entries.push({ summary: `${dto.disposeType}收款`, subjectId: bank.id, debit: proceeds, credit: 0 });
      entries.push({ summary: `${dto.disposeType}价款转入清理`, subjectId: liquidation.id, debit: 0, credit: proceeds });
    }
    // 清理净损益结平 1606
    const liqNet = r2(entries.filter((e) => e.subjectId === liquidation.id).reduce((a, e) => a + e.debit - e.credit, 0));
    if (liqNet > 0.004) {
      // 清理净损失
      if (!nonOpExpense) throw new BadRequestException('缺少 5711 营业外支出科目');
      entries.push({ summary: '处置净损失', subjectId: nonOpExpense.id, debit: liqNet, credit: 0 });
    } else if (liqNet < -0.004) {
      if (!nonOpIncome) throw new BadRequestException('缺少 5201 营业外收入科目');
      entries.push({ summary: '处置净收益', subjectId: nonOpIncome.id, debit: 0, credit: -liqNet });
    }

    const voucher = await this.vouchers.create(
      tenantId,
      userId,
      {
        word: '转',
        date: dto.disposeDate,
        memo: `固定资产${dto.disposeType}-${asset.name}`,
        entries,
      },
      { submit: true, sourceType: 6, sourceId: id },
    );

    await this.prisma.fixedAsset.update({
      where: { id },
      data: {
        status: 3,
        disposeDate: new Date(dto.disposeDate),
        disposeAmount: proceeds || null,
        disposeType: dto.disposeType,
        disposeVoucherId: voucher.id,
      },
    });
    return { ok: true, voucherId: voucher.id };
  }
}
