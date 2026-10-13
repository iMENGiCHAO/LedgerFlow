import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { BizException, ERR } from '../../common/errors';
import { BalanceService } from './balance.service';

export const SOURCE_TYPES = {
  MANUAL: 0,
  EXPENSE: 1,
  ARAP: 2,
  DEPRECIATION: 3,
  PROFIT_CARRY: 4,
  RED_FLUSH: 5,
  ASSET_DISPOSE: 6,
} as const;

export interface EntryInput {
  lineNo?: number;
  summary: string;
  subjectId: number;
  debit?: number | string;
  credit?: number | string;
  partnerId?: number | null;
  departmentId?: number | null;
  projectId?: number | null;
  settleType?: string | null;
  settleNo?: string | null;
}

export interface NormalizedEntry {
  lineNo: number;
  summary: string;
  subjectId: number;
  debit: number;
  credit: number;
  partnerId: number | null;
  departmentId: number | null;
  projectId: number | null;
  settleType: string | null;
  settleNo: string | null;
}

export interface VoucherInput {
  word?: string;
  date: string;
  attachmentCount?: number;
  memo?: string;
  entries: EntryInput[];
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : NaN;
};

@Injectable()
export class VoucherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  /** 分录与业务规则校验(R1/R3/R4/R15),返回规范化分录 */
  async validateAndNormalize(
    tenantId: number,
    input: VoucherInput,
    opts: { isRed?: boolean } = {},
  ): Promise<{ date: Date; entries: NormalizedEntry[] }> {
    const entries = input.entries || [];
    if (!Array.isArray(entries) || entries.length < 2) {
      throw new BizException(ERR.VOUCHER_UNBALANCED, '凭证至少需要两行分录');
    }
    const subjects = await this.balance.subjectsOf(tenantId);
    const sMap = new Map(subjects.map((s) => [s.id, s]));

    let sumD = 0;
    let sumC = 0;
    const normalized: NormalizedEntry[] = [];
    entries.forEach((e, idx) => {
      const d = num(e.debit);
      const c = num(e.credit);
      if (!Number.isFinite(d) || !Number.isFinite(c)) {
        throw new BizException(ERR.PARAM, `第${idx + 1}行金额格式错误`);
      }
      const subject = sMap.get(e.subjectId);
      if (!subject) throw new BizException(ERR.SUBJECT_INVALID, `第${idx + 1}行科目不存在`);
      if (!subject.isLeaf) throw new BizException(ERR.SUBJECT_INVALID, `科目 ${subject.code} ${subject.name} 不是末级科目`);
      if (subject.status !== 1) throw new BizException(ERR.SUBJECT_INVALID, `科目 ${subject.code} ${subject.name} 已停用`);

      const dOn = Math.abs(d) > 0.0001;
      const cOn = Math.abs(c) > 0.0001;
      if (dOn && cOn) throw new BizException(ERR.VOUCHER_UNBALANCED, `第${idx + 1}行借贷方向互斥`);
      if (!dOn && !cOn) throw new BizException(ERR.VOUCHER_UNBALANCED, `第${idx + 1}行金额不能为零`);
      if ((d < 0 || c < 0) && !opts.isRed) {
        throw new BizException(ERR.VOUCHER_UNBALANCED, '普通凭证不允许负数金额(红冲请使用红冲功能)');
      }

      const assist = subject.assist || {};
      if (assist.partner && !e.partnerId) throw new BizException(ERR.ASSIST_MISSING, `${subject.code} 需要选择往来单位`);
      if (assist.department && !e.departmentId) throw new BizException(ERR.ASSIST_MISSING, `${subject.code} 需要选择部门`);
      if (assist.project && !e.projectId) throw new BizException(ERR.ASSIST_MISSING, `${subject.code} 需要选择项目`);

      sumD += d;
      sumC += c;
      normalized.push({
        lineNo: idx + 1,
        summary: String(e.summary || '').slice(0, 200) || subject.name,
        subjectId: e.subjectId,
        debit: d,
        credit: c,
        partnerId: e.partnerId ?? null,
        departmentId: e.departmentId ?? null,
        projectId: e.projectId ?? null,
        settleType: e.settleType || null,
        settleNo: e.settleNo || null,
      });
    });
    // 红字凭证两侧均为负数,普通凭证要求合计为正
    if (Math.abs(sumD - sumC) > 0.0001) {
      throw new BizException(ERR.VOUCHER_UNBALANCED, `借贷不平衡:借方合计 ${sumD.toFixed(2)} ≠ 贷方合计 ${sumC.toFixed(2)}`);
    }
    if (!opts.isRed && Math.abs(sumD) < 0.0001) {
      throw new BizException(ERR.VOUCHER_UNBALANCED, '凭证合计金额必须大于零');
    }
    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) throw new BizException(ERR.PARAM, '凭证日期无效');
    return { date, entries: normalized };
  }

  async assertPeriodOpen(tenantId: number, date: Date): Promise<{ id: number; year: number; month: number; status: number }> {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const period = await this.prisma.period.findUnique({
      where: { tenantId_year_month: { tenantId, year, month } },
    });
    if (!period) throw new BizException(ERR.PERIOD_LOCKED, `${year}-${String(month).padStart(2, '0')} 会计期间不存在`);
    if (period.status === 2) throw new BizException(ERR.PERIOD_LOCKED, `${year}-${String(month).padStart(2, '0')} 已结账,禁止操作`);
    if (period.status === 0) throw new BizException(ERR.PERIOD_LOCKED, `${year}-${String(month).padStart(2, '0')} 尚未开始`);
    return period;
  }

  private async allocateNo(tx: Prisma.TransactionClient, tenantId: number, periodId: number, word: string): Promise<number> {
    const agg = await tx.voucher.aggregate({
      where: { tenantId, periodId, word },
      _max: { no: true },
    });
    return (agg._max.no ?? 0) + 1;
  }

  async create(tenantId: number, userId: number, input: VoucherInput, opts: { submit?: boolean; isRed?: boolean; sourceType?: number; sourceId?: number; redForVoucherId?: number } = {}) {
    const { date, entries } = await this.validateAndNormalize(tenantId, input, opts);
    const period = await this.assertPeriodOpen(tenantId, date);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const no = await this.allocateNo(tx, tenantId, period.id, input.word?.trim() || '记');
          const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
          return tx.voucher.create({
            data: {
              tenantId,
              periodId: period.id,
              word: input.word?.trim() || '记',
              no,
              date,
              status: opts.submit ? 1 : 0,
              totalDebit: new Prisma.Decimal(totalDebit.toFixed(2)),
              totalCredit: new Prisma.Decimal(entries.reduce((s, e) => s + e.credit, 0).toFixed(2)),
              attachmentCount: input.attachmentCount ?? 0,
              memo: input.memo || entries[0]?.summary || '',
              sourceType: opts.sourceType ?? SOURCE_TYPES.MANUAL,
              sourceId: opts.sourceId ?? null,
              redForVoucherId: opts.redForVoucherId ?? null,
              createdBy: userId,
              entries: {
                create: entries.map((e) => ({
                  lineNo: e.lineNo,
                  summary: e.summary,
                  subjectId: e.subjectId,
                  debit: new Prisma.Decimal(e.debit.toFixed(2)),
                  credit: new Prisma.Decimal(e.credit.toFixed(2)),
                  partnerId: e.partnerId,
                  departmentId: e.departmentId,
                  projectId: e.projectId,
                  settleType: e.settleType,
                  settleNo: e.settleNo,
                })),
              },
            },
            include: this.detailInclude(),
          });
        });
      } catch (err) {
        if ((err as Prisma.PrismaClientKnownRequestError)?.code === 'P2002' && attempt < 2) continue;
        throw err;
      }
    }
    throw new BadRequestException('凭证编号分配失败,请重试');
  }

  detailInclude() {
    return {
      entries: {
        orderBy: { lineNo: 'asc' },
        include: { subject: { select: { code: true, name: true } } },
      },
    } satisfies Prisma.VoucherInclude;
  }

  async getOne(tenantId: number, id: number) {
    const v = await this.prisma.voucher.findFirst({
      where: { id, tenantId },
      include: {
        ...this.detailInclude(),
        creator: { select: { realName: true } },
        auditor: { select: { realName: true } },
        attachments: { select: { id: true, fileName: true, fileSize: true, contentType: true, createdAt: true } },
      },
    });
    if (!v) throw new NotFoundException(`凭证 ${id} 不存在`);
    return v;
  }

  async list(
    tenantId: number,
    q: {
      page?: number;
      pageSize?: number;
      periodId?: number;
      status?: number;
      word?: string;
      dateFrom?: string;
      dateTo?: string;
      subjectId?: number;
      keyword?: string;
      minAmount?: number;
      maxAmount?: number;
      sourceType?: number;
    },
  ) {
    q.page = q.page ? Number(q.page) : undefined;
    q.pageSize = q.pageSize ? Number(q.pageSize) : undefined;
    const where: Prisma.VoucherWhereInput = { tenantId };
    if (q.periodId) where.periodId = Number(q.periodId);
    if (q.status !== undefined && q.status !== null && `${q.status}` !== '') where.status = Number(q.status);
    if (q.word) where.word = q.word;
    if (q.sourceType !== undefined && `${q.sourceType}` !== '' && q.sourceType !== null) where.sourceType = Number(q.sourceType);
    if (q.dateFrom || q.dateTo) {
      where.date = {};
      if (q.dateFrom) where.date.gte = new Date(q.dateFrom);
      if (q.dateTo) where.date.lte = new Date(`${q.dateTo}T23:59:59`);
    }
    if (q.keyword) {
      where.OR = [{ memo: { contains: q.keyword } }, { entries: { some: { summary: { contains: q.keyword } } } }];
    }
    if (q.subjectId) where.entries = { some: { subjectId: Number(q.subjectId) } };
    if (q.minAmount !== undefined && q.minAmount !== null && `${q.minAmount}` !== '') {
      where.totalDebit = { ...(where.totalDebit as Prisma.DecimalFilter), gte: Number(q.minAmount) };
    }
    if (q.maxAmount !== undefined && q.maxAmount !== null && `${q.maxAmount}` !== '') {
      where.totalDebit = { ...(where.totalDebit as Prisma.DecimalFilter), lte: Number(q.maxAmount) };
    }

    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const [total, list] = await Promise.all([
      this.prisma.voucher.count({ where }),
      this.prisma.voucher.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        // 列表页不返回 entries 数组(性能大坑,N+1)
        // 列表只显示摘要(分录总数 + 借贷合计已存在主表)
        select: {
          id: true,
          tenantId: true,
          periodId: true,
          word: true,
          no: true,
          date: true,
          status: true,
          totalDebit: true,
          totalCredit: true,
          attachmentCount: true,
          memo: true,
          sourceType: true,
          rejectReason: true,
          auditedAt: true,
          createdAt: true,
          _count: { select: { entries: true } },
          creator: { select: { realName: true } },
          auditor: { select: { realName: true } },
        },
      }),
    ]);
    return { total, page, pageSize, list };
  }

  /** 导出:不传分页,完整带 entries */
  async listAll(tenantId: number, q: {
    periodId?: number;
    status?: number;
    word?: string;
    dateFrom?: string;
    dateTo?: string;
    subjectId?: number;
    keyword?: string;
    minAmount?: number;
    maxAmount?: number;
    sourceType?: number;
  }) {
    const where: Prisma.VoucherWhereInput = { tenantId };
    if (q.periodId) where.periodId = Number(q.periodId);
    if (q.status !== undefined && q.status !== null && `${q.status}` !== '') where.status = Number(q.status);
    if (q.word) where.word = q.word;
    if (q.sourceType !== undefined && `${q.sourceType}` !== '' && q.sourceType !== null) where.sourceType = Number(q.sourceType);
    if (q.dateFrom || q.dateTo) {
      where.date = {};
      if (q.dateFrom) where.date.gte = new Date(q.dateFrom);
      if (q.dateTo) where.date.lte = new Date(`${q.dateTo}T23:59:59`);
    }
    if (q.keyword) where.OR = [{ memo: { contains: q.keyword } }, { entries: { some: { summary: { contains: q.keyword } } } }];
    if (q.subjectId) where.entries = { some: { subjectId: Number(q.subjectId) } };
    if (q.minAmount !== undefined && q.minAmount !== null && `${q.minAmount}` !== '') {
      where.totalDebit = { ...(where.totalDebit as Prisma.DecimalFilter), gte: Number(q.minAmount) };
    }
    if (q.maxAmount !== undefined && q.maxAmount !== null && `${q.maxAmount}` !== '') {
      where.totalDebit = { ...(where.totalDebit as Prisma.DecimalFilter), lte: Number(q.maxAmount) };
    }
    return this.prisma.voucher.findMany({
      where,
      orderBy: [{ date: 'asc' }, { no: 'asc' }],
      include: {
        entries: { orderBy: { lineNo: 'asc' }, include: { subject: { select: { code: true, name: true } } } },
        creator: { select: { realName: true } },
        auditor: { select: { realName: true } },
      },
    });
  }

  private async getVoucherOrThrow(tenantId: number, id: number) {
    const v = await this.prisma.voucher.findFirst({ where: { id, tenantId } });
    if (!v) throw new NotFoundException(`凭证 ${id} 不存在`);
    return v;
  }

  async submit(tenantId: number, id: number) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 0) throw new BizException(ERR.VOUCHER_STATUS, '只有草稿状态的凭证可以提交审核');
    await this.assertPeriodOpen(v.tenantId, v.date);
    return this.prisma.voucher.update({ where: { id }, data: { status: 1 } });
  }

  /**
   * 修改凭证:仅允许修改 status=0(草稿)或 status=3(已驳回),已记账凭证必须先反审核。
   * 关键: 不删除凭证,只重置 entries(保留 voucher 主表 + 凭证编号 + 期间)。
   * 修复:之前 delete + create 会换号,破坏明细账连续性。
   */
  async update(tenantId: number, userId: number, id: number, input: VoucherInput) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 0 && v.status !== 3) {
      throw new BizException(ERR.VOUCHER_STATUS,
        '只有草稿/已驳回凭证可直接修改,已记账凭证请先「反审核」');
    }
    if (v.status === 3 && v.createdBy !== userId) {
      throw new BizException(ERR.FORBIDDEN, '只有制单人可以重新修改已驳回凭证');
    }
    // 业务规则同 create,但允许 update 走 isRed 兼容
    const { date, entries } = await this.validateAndNormalize(tenantId, input, {});
    const period = await this.assertPeriodOpen(tenantId, date);
    if (period.id !== v.periodId) {
      throw new BizException(ERR.PERIOD_LOCKED, '修改后日期跨期,不能修改原凭证,请删除重建或调整到原期间');
    }
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    return this.prisma.$transaction(async (tx) => {
      await tx.voucherEntry.deleteMany({ where: { voucherId: id } });
      const updated = await tx.voucher.update({
        where: { id },
        data: {
          date,
          periodId: period.id,
          totalDebit: new Prisma.Decimal(totalDebit.toFixed(2)),
          totalCredit: new Prisma.Decimal(totalCredit.toFixed(2)),
          attachmentCount: input.attachmentCount ?? 0,
          memo: input.memo || entries[0]?.summary || '',
          // 修改后回到草稿,清空驳回原因
          status: 0,
          rejectReason: null,
          auditedBy: null,
          auditedAt: null,
          entries: {
            create: entries.map((e, idx) => ({
              lineNo: idx + 1,
              summary: e.summary,
              subjectId: e.subjectId,
              debit: new Prisma.Decimal(e.debit.toFixed(2)),
              credit: new Prisma.Decimal(e.credit.toFixed(2)),
              partnerId: e.partnerId,
              departmentId: e.departmentId,
              projectId: e.projectId,
              settleType: e.settleType,
              settleNo: e.settleNo,
            })),
          },
        },
        include: this.detailInclude(),
      });
      return updated;
    });
  }

  async reject(tenantId: number, userId: number, id: number, reason: string) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 1) throw new BizException(ERR.VOUCHER_STATUS, '只有待审核状态的凭证可以驳回');
    if (v.createdBy === userId) throw new BizException(ERR.FORBIDDEN, '制单人与审核人不能相同');
    return this.prisma.voucher.update({
      where: { id },
      data: { status: 0, rejectReason: reason || '驳回' },
    });
  }

  async approve(tenantId: number, userId: number, id: number) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 1) throw new BizException(ERR.VOUCHER_STATUS, '只有待审核状态的凭证可以记账');
    if (v.createdBy === userId) throw new BizException(ERR.FORBIDDEN, '制单人与审核人不能为同一用户');
    await this.assertPeriodOpen(v.tenantId, v.date);
    return this.prisma.voucher.update({
      where: { id },
      data: { status: 2, auditedBy: userId, auditedAt: new Date(), rejectReason: null },
    });
  }

  /** 反审核:已记账 → 待审核。校验期间未结账且无下游引用(R8/R7) */
  async cancelAudit(tenantId: number, id: number) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 2) throw new BizException(ERR.VOUCHER_STATUS, '只有已记账的凭证可以反审核');
    const period = await this.prisma.period.findUnique({ where: { id: v.periodId } });
    if (period?.status === 2) throw new BizException(ERR.PERIOD_LOCKED, `${period.year}-${String(period.month).padStart(2, '0')} 已结账,请先反结账`);

    const refs = await this.downstreamRefs(tenantId, id);
    if (refs.length > 0) {
      throw new BizException(ERR.DOWNSTREAM_REF, `该凭证已被以下业务引用,不可反审核:${refs.join('、')}`);
    }
    return this.prisma.voucher.update({ where: { id }, data: { status: 1, auditedBy: null, auditedAt: null } });
  }

  private async downstreamRefs(tenantId: number, voucherId: number): Promise<string[]> {
    const refs: string[] = [];
    const [bill, invoice, claim, dep, assetDispose] = await Promise.all([
      this.prisma.arapBill.count({ where: { tenantId, voucherId } }),
      this.prisma.invoice.count({ where: { tenantId, voucherId } }),
      this.prisma.expenseClaim.count({ where: { tenantId, payVoucherId: voucherId } }),
      this.prisma.depreciationRecord.count({ where: { tenantId, voucherId } }),
      this.prisma.fixedAsset.count({ where: { tenantId, disposeVoucherId: voucherId } }),
    ]);
    if (bill > 0) refs.push('应收应付单据');
    if (invoice > 0) refs.push('发票台账');
    if (claim > 0) refs.push('费用报销单');
    if (dep > 0) refs.push('折旧记录');
    if (assetDispose > 0) refs.push('资产处置');
    return refs;
  }

  async voidVoucher(tenantId: number, id: number) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 0 && v.status !== 1) throw new BizException(ERR.VOUCHER_STATUS, '仅草稿或待审核凭证可作废');
    return this.prisma.voucher.update({ where: { id }, data: { status: 3 } });
  }

  async remove(tenantId: number, id: number) {
    const v = await this.getVoucherOrThrow(tenantId, id);
    if (v.status !== 0) throw new BizException(ERR.VOUCHER_STATUS, '只有草稿状态的凭证可以删除');
    await this.prisma.attachment.deleteMany({ where: { ownerType: 'voucher', ownerId: id } });
    await this.prisma.voucher.delete({ where: { id } });
    return { deleted: true };
  }

  /** 红冲:对已记账凭证生成等额反向红字新凭证 */
  async redFlush(tenantId: number, userId: number, id: number, date?: string) {
    const origin = await this.getVoucherOrThrow(tenantId, id);
    if (origin.status !== 2) throw new BizException(ERR.VOUCHER_STATUS, '只能对已记账凭证进行红冲');
    const flushed = await this.prisma.voucher.findFirst({
      where: { tenantId, redForVoucherId: id, status: { in: [1, 2] } },
    });
    if (flushed) throw new BizException(ERR.VOUCHER_STATUS, `该凭证已被红冲(新凭证 #${flushed.id})`);

    const entries = await this.prisma.voucherEntry.findMany({
      where: { voucherId: id },
      orderBy: { lineNo: 'asc' },
    });
    const flushDate = date || new Date().toISOString().slice(0, 10);
    return this.create(
      tenantId,
      userId,
      {
        word: '记',
        date: flushDate,
        memo: `红冲【${origin.word}-${origin.no}】${origin.memo || ''}`.slice(0, 180),
        entries: entries.map((e) => ({
          lineNo: e.lineNo,
          summary: e.summary.startsWith('红冲') ? e.summary : `红冲:${e.summary}`,
          subjectId: e.subjectId,
          debit: num(e.debit) !== 0 ? -num(e.debit) : 0,
          credit: num(e.credit) !== 0 ? -num(e.credit) : 0,
          partnerId: e.partnerId,
          departmentId: e.departmentId,
          projectId: e.projectId,
          settleType: e.settleType,
          settleNo: e.settleNo,
        })),
      },
      { submit: false, isRed: true, sourceType: SOURCE_TYPES.RED_FLUSH, sourceId: id, redForVoucherId: id },
    );
  }

  /** 批量提交指定期间的草稿(辅助测试/初始化) */
  async submitAllDrafts(tenantId: number, ids: number[]) {
    let ok = 0;
    for (const id of ids) {
      try {
        await this.submit(tenantId, id);
        ok++;
      } catch {
        /* 单张失败不影响其他 */
      }
    }
    return { submitted: ok };
  }

  /** 检查当前用户是否可以审核(与制单人不同) */
  assertCanAudit(userId: number, createdBy: number) {
    if (userId === createdBy) throw new ForbiddenException('制单人与审核人不能相同');
  }
}
