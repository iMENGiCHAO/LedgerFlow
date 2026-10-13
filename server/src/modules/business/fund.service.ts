import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BalanceService, periodSeq } from '../ledger/balance.service';

const r2 = (x: number) => Math.round(x * 100) / 100;

@Injectable()
export class FundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  // ==================== 账户 ====================
  accounts(tenantId: number) {
    return this.prisma.bankAccount.findMany({ where: { tenantId }, include: { subject: { select: { code: true, name: true } } }, orderBy: { id: 'asc' } });
  }

  async saveAccount(
    tenantId: number,
    dto: { id?: number; name: string; bankName?: string; accountNo?: string; subjectCode: string },
  ) {
    const subjects = await this.balance.subjectsOf(tenantId);
    const subj = subjects.find((s) => s.code === dto.subjectCode);
    if (!subj || !subj.isLeaf) throw new BadRequestException('资金科目必须是末级科目(建议挂在 1002 银行存款下)');
    if (dto.id) {
      // 越权防御
      const found = await this.prisma.bankAccount.findFirst({ where: { id: dto.id, tenantId } });
      if (!found) throw new NotFoundException('资金账户不存在');
      return this.prisma.bankAccount.update({ where: { id: dto.id }, data: { name: dto.name, bankName: dto.bankName, accountNo: dto.accountNo, subjectId: subj.id } });
    }
    return this.prisma.bankAccount.create({
      data: { tenantId, name: dto.name, bankName: dto.bankName ?? '', accountNo: dto.accountNo ?? '', subjectId: subj.id },
    });
  }

  /** 日记账:已记账凭证中的现金/银行分录 */
  async journals(
    tenantId: number,
    q: { accountId?: number; year?: number; month?: number; keyword?: string; page?: number; pageSize?: number },
  ) {
    const subjects = (await this.balance.subjectsOf(tenantId)).filter((s) => ['1001', '1002', '1012'].some((c) => s.code.startsWith(c)));
    const cashIds = new Set(subjects.map((s) => s.id));
    let accountSubjectId: number | null = null;
    if (q.accountId) {
      const acc = await this.prisma.bankAccount.findFirst({ where: { id: Number(q.accountId), tenantId } });
      if (acc) accountSubjectId = acc.subjectId;
    }
    const yearNum = q.year ? Number(q.year) : undefined;
    const monthNum = q.month ? Number(q.month) : undefined;

    const where = {
      voucher: {
        tenantId,
        status: 2,
        ...(yearNum && monthNum
          ? { period: { year: yearNum, month: monthNum } }
          : {}),
        ...(yearNum && !monthNum ? { period: { year: yearNum } } : {}),
      },
      subjectId: accountSubjectId ?? undefined,
    };

    const all = await this.prisma.voucherEntry.findMany({
      where,
      orderBy: [{ voucher: { date: 'asc' } }, { voucherId: 'asc' }, { lineNo: 'asc' }],
      include: {
        voucher: { select: { word: true, no: true, date: true } },
        subject: { select: { code: true, name: true } },
        partner: { select: { name: true } },
      },
    });
    let rows = all.filter((e) => cashIds.has(e.subjectId));
    if (q.keyword) rows = rows.filter((e) => e.summary.includes(q.keyword!) || (e.settleNo ?? '').includes(q.keyword!));

    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const paged = rows.slice((page - 1) * pageSize, page * pageSize);
    return {
      total: rows.length,
      page,
      pageSize,
      list: paged.map((e) => ({
        id: e.id,
        date: e.voucher.date,
        voucherWord: e.voucher.word,
        voucherNo: e.voucher.no,
        summary: e.summary,
        subjectCode: e.subject.code,
        subjectName: e.subject.name,
        direction: Number(e.debit) > 0 ? '收' : '付',
        amount: r2(Math.abs(Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit))),
        settleType: e.settleType,
        settleNo: e.settleNo,
        partnerName: e.partner?.name,
        matched: false,
      })),
    };
  }

  // ==================== 对账单与勾兑 ====================
  async importStatement(
    tenantId: number,
    userId: number,
    dto: { accountId: number; csv: string },
  ) {
    const lines = dto.csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('对账单内容为空');
    let ok = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (!cols[0] || !cols[1]) continue;
      await this.prisma.statementLine.create({
        data: {
          tenantId,
          accountId: dto.accountId,
          date: new Date(cols[0]),
          amount: r2(Number(cols[1])),
          memo: cols[2] || '',
          importedBy: userId,
        },
      });
      ok++;
    }
    return { imported: ok };
  }

  statementLines(tenantId: number, accountId: number, matched?: string) {
    const where = {
      tenantId,
      accountId,
      ...(matched === 'no' ? { matchedEntryId: null } : {}),
      ...(matched === 'yes' ? { NOT: { matchedEntryId: null } } : {}),
    };
    return this.prisma.statementLine.findMany({ where, orderBy: [{ date: 'asc' }] });
  }

  /** 自动勾兑:金额相同、日期±3天、未勾兑 */
  async autoMatch(tenantId: number, accountId: number) {
    const acc = await this.prisma.bankAccount.findFirst({ where: { id: accountId, tenantId } });
    if (!acc) throw new BadRequestException('账户不存在');
    const lines = await this.prisma.statementLine.findMany({ where: { tenantId, accountId, matchedEntryId: null } });
    const journals = await this.journals(tenantId, { accountId, pageSize: 500 });

    let matched = 0;
    for (const line of lines) {
      const cand = journals.list.find(
        (j) =>
          Math.abs(j.amount - Math.abs(Number(line.amount))) < 0.005 &&
          Math.abs(new Date(j.date).getTime() - new Date(line.date).getTime()) <= 3 * 86400000,
      );
      if (cand) {
        await this.prisma.statementLine.update({
          where: { id: line.id },
          data: { matchedEntryId: cand.id, matchedAt: new Date() },
        });
        matched++;
      }
    }
    return { matched };
  }

  async manualMatch(tenantId: number, lineId: number, entryId: number | null) {
    const line = await this.prisma.statementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) throw new BadRequestException('对账单行不存在');
    return this.prisma.statementLine.update({
      where: { id: lineId },
      data: { matchedEntryId: entryId, matchedAt: entryId ? new Date() : null },
    });
  }

  /** 余额调节表 */
  async reconciliation(tenantId: number, accountId: number, year: number, month: number) {
    const acc = await this.prisma.bankAccount.findFirst({ where: { id: accountId, tenantId }, include: { subject: true } });
    if (!acc) throw new BadRequestException('账户不存在');

    const seq = periodSeq(year, month);
    const balMap = await this.balance.computeBalances(tenantId, seq, seq);
    const sb = balMap.get(acc.subjectId);
    const bookBalanceNet = sb ? sb.closeDebit - sb.closeCredit : 0;

    const lines = await this.prisma.statementLine.findMany({
      where: { tenantId, accountId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const unMatched = lines.filter((l) => !l.matchedEntryId);
    const bankRecvNotBooked = r2(unMatched.filter((l) => Number(l.amount) > 0).reduce((a, l) => a + Number(l.amount), 0));
    const bankPaidNotBooked = r2(unMatched.filter((l) => Number(l.amount) < 0).reduce((a, l) => a + Number(l.amount), 0));

    const stmtTotal = r2(lines.reduce((a, l) => a + Number(l.amount), 0));

    return {
      account: { id: acc.id, name: acc.name, bankName: acc.bankName, accountNo: acc.accountNo },
      yearMonth: `${year}-${String(month).padStart(2, '0')}`,
      bookBalance: r2(bookBalanceNet),
      companyRecvBankNot: null as number | null, // 由前端根据未勾兑日记账展示
      adjustedBalance: r2(bookBalanceNet + bankRecvNotBooked + bankPaidNotBooked),
      statement: {
        totalIn: r2(lines.filter((l) => Number(l.amount) > 0).reduce((a, l) => a + Number(l.amount), 0)),
        totalOut: r2(lines.filter((l) => Number(l.amount) < 0).reduce((a, l) => a + Number(l.amount), 0)),
        netChange: stmtTotal,
        unmatchedCount: unMatched.length,
      },
      unmatchedLines: unMatched.map((l) => ({ ...l })),
    };
  }
}
