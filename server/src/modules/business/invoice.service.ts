import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ArapService } from './arap.service';

const r2 = (x: number) => Math.round(x * 100) / 100;

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arap: ArapService,
  ) {}

  async list(tenantId: number, q: { page?: number; pageSize?: number; io?: number; keyword?: string; from?: string; to?: string }) {
    const where = {
      tenantId,
      ...(q.io ? { io: Number(q.io) } : {}),
      ...(q.keyword ? { OR: [{ invoiceNo: { contains: q.keyword } }, { title: { contains: q.keyword } }] } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 20));
    const [total, list] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { partner: { select: { code: true, name: true } } },
      }),
    ]);
    return { total, page, pageSize, list };
  }

  /** 导出:无分页 */
  async listAll(tenantId: number, q: { io?: number; keyword?: string; from?: string; to?: string }) {
    const where = {
      tenantId,
      ...(q.io ? { io: Number(q.io) } : {}),
      ...(q.keyword ? { OR: [{ invoiceNo: { contains: q.keyword } }, { title: { contains: q.keyword } }] } : {}),
      ...(q.from || q.to ? { date: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    return this.prisma.invoice.findMany({
      where,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      include: { partner: { select: { code: true, name: true } } },
    });
  }

  async save(
    tenantId: number,
    userId: number,
    dto: {
      id?: number;
      io: number;
      invoiceNo: string;
      partnerCode?: string;
      title?: string;
      itemName?: string;
      date: string;
      amount: number;
      taxRate: number;
    },
  ) {
    const amount = r2(Number(dto.amount));
    const taxRate = Number(dto.taxRate);
    const taxAmount = r2(amount * taxRate);
    const total = r2(amount + taxAmount);
    let partnerId: number | null = null;
    if (dto.partnerCode) {
      const p = await this.prisma.partner.findFirst({ where: { tenantId, code: dto.partnerCode } });
      if (!p) throw new BadRequestException(`往来单位 ${dto.partnerCode} 不存在`);
      partnerId = p.id;
    }
    if (dto.id) {
      // 越权防御:必须先确认发票属于当前租户
      const found = await this.prisma.invoice.findFirst({ where: { id: dto.id, tenantId } });
      if (!found) throw new NotFoundException('发票不存在');
      return this.prisma.invoice.update({
        where: { id: dto.id },
        data: { io: dto.io, invoiceNo: dto.invoiceNo, partnerId, title: dto.title, itemName: dto.itemName, date: new Date(dto.date), amount, taxRate, taxAmount, total },
      });
    }
    const dup = await this.prisma.invoice.findFirst({ where: { tenantId, invoiceNo: dto.invoiceNo } });
    if (dup) throw new BadRequestException(`发票号 ${dto.invoiceNo} 已登记`);
    return this.prisma.invoice.create({
      data: {
        tenantId,
        io: dto.io,
        invoiceNo: dto.invoiceNo,
        partnerId,
        title: dto.title,
        itemName: dto.itemName,
        date: new Date(dto.date),
        amount,
        taxRate,
        taxAmount,
        total,
        createdBy: userId,
      },
    });
  }

  /** CSV 批量导入:表头顺序 方向,开票日期,发票号码,对方单位,品名,不含税金额,税率 */
  async importCsv(tenantId: number, userId: number, csv: string) {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new BadRequestException('CSV 内容为空或缺少数据行');
    let ok = 0;
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      try {
        const ioRaw = cols[0];
        const io = ioRaw.includes('销') ? 1 : ioRaw.includes('进') ? 2 : Number(ioRaw) === 1 ? 1 : 2;
        await this.save(tenantId, userId, {
          io,
          date: cols[1],
          invoiceNo: cols[2],
          title: cols[3],
          itemName: cols[4] || undefined,
          amount: Number(cols[5]),
          taxRate: cols[6] !== undefined && cols[6] !== '' ? (cols[6].includes('%') ? Number(cols[6].replace('%', '')) / 100 : Number(cols[6])) : 0.13,
        });
        ok++;
      } catch (e) {
        errors.push(`第${i + 1}行:${(e as Error).message}`);
      }
    }
    return { imported: ok, failed: errors.length, errors: errors.slice(0, 10) };
  }

  /** 增值税统计(按月):销项税 - 进项税 */
  async vatSummary(tenantId: number, year: number) {
    const rows = await this.prisma.invoice.groupBy({
      by: ['io'],
      where: {
        tenantId,
        status: 1,
        date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) },
      },
      _sum: { amount: true, taxAmount: true, total: true },
    });
    const sales = rows.find((r) => r.io === 1)?._sum;
    const purchase = rows.find((r) => r.io === 2)?._sum;
    const sTax = Number(sales?.taxAmount ?? 0);
    const pTax = Number(purchase?.taxAmount ?? 0);
    return {
      year,
      salesAmount: r2(Number(sales?.amount ?? 0)),
      salesTax: r2(sTax),
      purchaseAmount: r2(Number(purchase?.amount ?? 0)),
      purchaseTax: r2(pTax),
      payableVat: r2(sTax - pTax),
    };
  }

  /**
   * 增值税申报测算(季度,按税率分组明细)
   * 输出双口径:一般纳税人(应纳=销项-进项可抵扣)与小规模(销售额×征收率,进项不抵扣)
   * 仅作申报前测算参考,实际申报以税局系统为准。
   */
  async vatDeclaration(tenantId: number, year: number, quarter: number) {
    if (quarter < 1 || quarter > 4) throw new BadRequestException('季度参数不合法(1-4)');
    const mFrom = (quarter - 1) * 3 + 1;
    const mTo = mFrom + 2;
    const from = new Date(`${year}-${String(mFrom).padStart(2, '0')}-01`);
    const to = new Date(`${year}-${String(mTo).padStart(2, '0')}-31T23:59:59`);

    const rows = await this.prisma.invoice.findMany({
      where: { tenantId, status: 1, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    const group = (io: number) => {
      const m = new Map<string, { rate: number; count: number; amount: number; tax: number; total: number }>();
      for (const r of rows) {
        if (r.io !== io) continue;
        const rate = Number(r.taxRate);
        const key = rate.toFixed(4);
        const g = m.get(key) ?? { rate, count: 0, amount: 0, tax: 0, total: 0 };
        g.count += 1;
        g.amount = r2(g.amount + Number(r.amount));
        g.tax = r2(g.tax + Number(r.taxAmount));
        g.total = r2(g.total + Number(r.total));
        m.set(key, g);
      }
      return [...m.values()].sort((a, b) => b.rate - a.rate);
    };

    const sales = group(1);
    const purchase = group(2);
    const salesTax = r2(sales.reduce((s, g) => s + g.tax, 0));
    const salesAmount = r2(sales.reduce((s, g) => s + g.amount, 0));
    const purchaseTax = r2(purchase.reduce((s, g) => s + g.tax, 0));
    const invoiceCount = rows.length;

    // 小规模判定:销项税率全部 ≤ 0.03(征收率口径)
    const isSmallScale = sales.length > 0 && sales.every((g) => g.rate <= 0.0301);
    const levyRate = isSmallScale ? (sales[0]?.rate ?? 0.03) : 0;
    return {
      year,
      quarter,
      range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      invoiceCount,
      sales: { groups: sales, amountTotal: salesAmount, taxTotal: salesTax },
      purchase: { groups: purchase, amountTotal: r2(purchase.reduce((s, g) => s + g.amount, 0)), taxTotal: purchaseTax },
      calc: {
        isSmallScale,
        levyRate,
        generalPayable: r2(salesTax - purchaseTax), // 一般纳税人:应纳=销项-可抵扣进项
        smallPayable: r2(salesAmount * levyRate),   // 小规模:不含税销售额×征收率
      },
      notice: '本测算基于发票台账自动汇总,仅供申报参考;实际申报口径以电子税务局系统为准。',
    };
  }

  /** 销项发票 → 应收单 */
  async toReceivable(tenantId: number, userId: number, invoiceId: number) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) throw new BadRequestException('发票不存在');
    if (inv.arapBillId) throw new BadRequestException('该发票已生成应收单');
    if (inv.io !== 1) throw new BadRequestException('仅销项发票可生成应收单');
    if (!inv.partnerId) throw new BadRequestException('发票未关联往来单位,请先补全');

    const bill = await this.arap.createBill(tenantId, userId, {
      type: 1,
      partnerId: inv.partnerId,
      date: inv.date.toISOString().slice(0, 10),
      amount: Number(inv.total),
      memo: `销项发票 ${inv.invoiceNo}`,
    });
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { arapBillId: bill.id } });
    return bill;
  }

  async remove(tenantId: number, id: number) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!inv) throw new BadRequestException('发票不存在');
    if (inv.arapBillId) throw new BadRequestException('已生成应收单,不可删除');
    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true };
  }
}
