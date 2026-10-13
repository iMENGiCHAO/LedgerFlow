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
