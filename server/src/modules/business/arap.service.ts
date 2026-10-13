import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { VoucherService } from '../ledger/voucher.service';

const r2 = (x: number) => Math.round(x * 100) / 100;
const TYPE_NAMES: Record<number, string> = { 1: 'AR', 2: 'RC', 3: 'AP', 4: 'PY' };

@Injectable()
export class ArapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VoucherService,
  ) {}

  private async nextBillNo(tenantId: number, type: number, date: Date): Promise<string> {
    const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `${TYPE_NAMES[type]}-${ym}-`;
    const agg = await this.prisma.arapBill.aggregate({
      where: { tenantId, type, billNo: { startsWith: prefix } },
      _max: { billNo: true },
    });
    const last = agg._max.billNo;
    const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async list(
    tenantId: number,
    q: { page?: number; pageSize?: number; type?: number; partnerId?: number; settled?: string; keyword?: string },
  ) {
    const where = {
      tenantId,
      ...(q.type ? { type: Number(q.type) } : {}),
      ...(q.partnerId ? { partnerId: Number(q.partnerId) } : {}),
      ...(q.keyword ? { memo: { contains: q.keyword } } : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 20));
    const [total, list] = await Promise.all([
      this.prisma.arapBill.count({ where }),
      this.prisma.arapBill.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          partner: { select: { code: true, name: true } },
          settleSubject: { select: { code: true, name: true } },
          voucher: { select: { id: true, word: true, no: true, status: true } },
        },
      }),
    ]);
    const filtered =
      q.settled === 'no'
        ? list.filter((b) => b.type !== 2 && b.type !== 4 && Number(b.writtenOff) < Number(b.amount))
        : q.settled === 'yes'
          ? list.filter((b) => Number(b.writtenOff) >= Number(b.amount) && b.type !== 2 && b.type !== 4)
          : list;
    return {
      total,
      page,
      pageSize,
      list: filtered.map((b) => ({
        ...b,
        outstanding: r2(Number(b.amount) - Number(b.writtenOff)),
      })),
    };
  }

  /** 导出:无分页全量 */
  async listAll(tenantId: number, q: { type?: number; partnerId?: number; settled?: string; keyword?: string }) {
    const where = {
      tenantId,
      ...(q.type ? { type: Number(q.type) } : {}),
      ...(q.partnerId ? { partnerId: Number(q.partnerId) } : {}),
      ...(q.keyword ? { memo: { contains: q.keyword } } : {}),
    };
    const list = await this.prisma.arapBill.findMany({
      where,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      include: { partner: { select: { code: true, name: true } } },
    });
    if (q.settled === 'no') return list.filter((b) => Number(b.writtenOff) < Number(b.amount));
    if (q.settled === 'yes') return list.filter((b) => Number(b.writtenOff) >= Number(b.amount));
    return list;
  }

  /** 创建单据;收款/付款单可自动生成凭证草稿 */
  async createBill(
    tenantId: number,
    userId: number,
    dto: {
      type: number;
      partnerId: number;
      date: string;
      dueDate?: string;
      amount: number;
      memo?: string;
      settleType?: string;
      settleNo?: string;
      settleSubjectCode?: string;
      generateVoucher?: boolean;
    },
  ) {
    const amount = r2(Number(dto.amount));
    if (!(amount > 0)) throw new BadRequestException('金额必须大于零');
    const partner = await this.prisma.partner.findFirst({ where: { id: dto.partnerId, tenantId } });
    if (!partner) throw new BadRequestException('往来单位不存在');
    const date = new Date(dto.date);
    const billNo = await this.nextBillNo(tenantId, dto.type, date);

    let voucherId: number | null = null;
    if ((dto.type === 2 || dto.type === 4) && dto.generateVoucher !== false && dto.settleSubjectCode) {
      const subjects = await this.prisma.subject.findMany({ where: { tenantId } });
      const settleSubject = subjects.find((s) => s.code === dto.settleSubjectCode);
      const arSubject = subjects.find((s) => s.code === '1122');
      const apSubject = subjects.find((s) => s.code === '2202');
      if (!settleSubject || !arSubject || !apSubject) throw new BadRequestException('缺少必要科目(1002/1122/2202)');
      const entries =
        dto.type === 2
          ? [
              { summary: `收到 ${partner.name} 款项`, subjectId: settleSubject.id, debit: amount, credit: 0, partnerId: null, settleType: dto.settleType, settleNo: dto.settleNo },
              { summary: `核销 ${partner.name} 应收款`, subjectId: arSubject.id, debit: 0, credit: amount, partnerId: partner.id },
            ]
          : [
              { summary: `支付 ${partner.name} 款项`, subjectId: apSubject.id, debit: amount, credit: 0, partnerId: partner.id },
              { summary: `支付 ${partner.name} 款项`, subjectId: settleSubject.id, debit: 0, credit: amount, partnerId: null, settleType: dto.settleType, settleNo: dto.settleNo },
            ];
      const v = await this.vouchers.create(
        tenantId,
        userId,
        {
          word: dto.type === 2 ? '收' : '付',
          date: dto.date,
          memo: `${dto.type === 2 ? '收款' : '付款'}-${billNo}`,
          entries,
        },
        { submit: true, sourceType: 2 },
      );
      voucherId = v.id;
    }

    return this.prisma.arapBill.create({
      data: {
        tenantId,
        type: dto.type,
        billNo,
        partnerId: dto.partnerId,
        date,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        amount,
        memo: dto.memo,
        settleSubjectId: undefined,
        voucherId,
        createdBy: userId,
      } as never,
    });
  }

  async removeBill(tenantId: number, id: number) {
    const bill = await this.prisma.arapBill.findFirst({ where: { id, tenantId } });
    if (!bill) throw new BadRequestException('单据不存在');
    if (bill.voucherId) throw new BadRequestException('该单据已生成凭证,请先处理凭证');
    if (Number(bill.writtenOff) > 0) throw new BadRequestException('该单据已发生核销,不可删除');
    await this.prisma.arapBill.delete({ where: { id } });
    return { deleted: true };
  }

  /** 核销:应收↔收款 或 应付↔付款 */
  async writeoff(tenantId: number, userId: number, dto: { openBillId: number; settleBillId: number; amount: number }) {
    const amount = r2(Number(dto.amount));
    const [openBill, settleBill] = await Promise.all([
      this.prisma.arapBill.findFirst({ where: { id: dto.openBillId, tenantId } }),
      this.prisma.arapBill.findFirst({ where: { id: dto.settleBillId, tenantId } }),
    ]);
    if (!openBill || !settleBill) throw new BadRequestException('单据不存在');
    if (!(openBill.type === 1 && settleBill.type === 2) && !(openBill.type === 3 && settleBill.type === 4)) {
      throw new BadRequestException('只能核销「应收↔收款」或「应付↔付款」组合');
    }
    const openRemain = r2(Number(openBill.amount) - Number(openBill.writtenOff));
    const settleRemain = r2(Number(settleBill.amount) - Number(settleBill.writtenOff));
    if (amount <= 0 || amount > Math.min(openRemain, settleRemain) + 0.001) {
      throw new BadRequestException(`核销金额无效(可用额度:对方 ${Math.min(openRemain, settleRemain).toFixed(2)})`);
    }
    await this.prisma.$transaction([
      this.prisma.arapBill.update({ where: { id: openBill.id }, data: { writtenOff: { increment: amount } } }),
      this.prisma.arapBill.update({ where: { id: settleBill.id }, data: { writtenOff: { increment: amount } } }),
      this.prisma.arapWriteoff.create({
        data: { tenantId, openBillId: openBill.id, settleBillId: settleBill.id, amount, createdBy: userId },
      }),
    ]);
    return { ok: true };
  }

  async writeoffsOfBill(tenantId: number, billId: number) {
    return this.prisma.arapWriteoff.findMany({
      where: { tenantId, OR: [{ openBillId: billId }, { settleBillId: billId }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 账龄分析:type 1 应收 / 3 应付 */
  async aging(tenantId: number, type: 1 | 3) {
    const bills = await this.prisma.arapBill.findMany({
      where: { tenantId, type },
      include: { partner: { select: { id: true, name: true } } },
    });
    const today = new Date();
    const byPartner = new Map<number, { partnerId: number; partnerName: string; b0_30: number; b31_60: number; b61_90: number; b90p: number; total: number; overdueTotal: number }>();
    for (const b of bills) {
      const outstanding = r2(Number(b.amount) - Number(b.writtenOff));
      if (outstanding <= 0.004) continue;
      const days = b.dueDate ? Math.floor((today.getTime() - new Date(b.dueDate).getTime()) / 86400000) : 0;
      const overdueDays = Math.max(0, days);
      const key = b.partnerId;
      const cur = byPartner.get(key) ?? { partnerId: key, partnerName: b.partner.name, b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0, total: 0, overdueTotal: 0 };
      if (overdueDays <= 30) cur.b0_30 = r2(cur.b0_30 + outstanding);
      else if (overdueDays <= 60) cur.b31_60 = r2(cur.b31_60 + outstanding);
      else if (overdueDays <= 90) cur.b61_90 = r2(cur.b61_90 + outstanding);
      else cur.b90p = r2(cur.b90p + outstanding);
      if (overdueDays > 0) cur.overdueTotal = r2(cur.overdueTotal + outstanding);
      cur.total = r2(cur.total + outstanding);
      byPartner.set(key, cur);
    }
    return { list: [...byPartner.values()].sort((a, b) => b.total - a.total) };
  }
}
