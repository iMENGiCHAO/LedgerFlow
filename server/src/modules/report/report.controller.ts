import { Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentTid, Perm } from '../../common/decorators';
import { ReportService } from './report.service';
import { CashFlowService } from './cashflow.service';
import { PrismaService } from '../../prisma.service';
import { buildXlsx, sendXlsx } from '../../common/excel';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly cashflow: CashFlowService,
    private readonly prisma: PrismaService,
  ) {}

  /** 现金流量表(小企业会计准则表样;format=xlsx 导出) */
  @Get('cash-flow')
  @Perm('report:view')
  async cashFlow(
    @CurrentTid() tenantId: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('format') format: 'xlsx' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.cashflow.generate(tenantId, year, month);
    if (format === 'xlsx') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildCfXlsx(tenant?.name || '', year, month, data);
      sendXlsx(res, buf, `现金流量表-${year}-${String(month).padStart(2, '0')}.xlsx`);
      return;
    }
    return data;
  }

  @Get('balance-sheet')
  @Perm('report:view')
  async balanceSheet(
    @CurrentTid() tenantId: number,
    @Query('periodId') periodId: string | undefined,
    @Query('format') format: 'xlsx' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.reports.resolveSeq(tenantId, periodId ? Number(periodId) : undefined);
    const data: any = await this.reports.buildReport(tenantId, 'BS', s.seq);
    if (format === 'xlsx') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildBsXlsx(tenant?.name || '', s.year, s.month, data);
      sendXlsx(res, buf, `资产负债表-${s.year}-${String(s.month).padStart(2, '0')}.xlsx`);
      return;
    }
    return data;
  }

  @Get('income')
  @Perm('report:view')
  async income(
    @CurrentTid() tenantId: number,
    @Query('periodId') periodId: string | undefined,
    @Query('fromMonth') fromMonth: string | undefined,
    @Query('format') format: 'xlsx' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.reports.resolveSeq(tenantId, periodId ? Number(periodId) : undefined);
    const start = fromMonth ? s.year * 12 + Math.max(1, Math.min(12, Number(fromMonth))) : s.seq;
    const data: any = await this.reports.buildReport(tenantId, 'IS', s.seq, start);
    if (format === 'xlsx') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildIsXlsx(tenant?.name || '', s.year, s.month, data);
      sendXlsx(res, buf, `利润表-${s.year}-${String(s.month).padStart(2, '0')}.xlsx`);
      return;
    }
    return data;
  }

  @Get('balance-summary')
  @Perm('ledger:view')
  async balanceSummary(
    @CurrentTid() tenantId: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('level') level: string | undefined,
    @Query('format') format: 'xlsx' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data: any = await this.reports.balanceSummary(tenantId, year, month, level ? { level: Number(level) } : {});
    if (format === 'xlsx') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildSummaryXlsx(tenant?.name || '', year, month, data);
      sendXlsx(res, buf, `科目余额表-${year}-${String(month).padStart(2, '0')}.xlsx`);
      return;
    }
    return data;
  }

  @Get('detail-ledger/:subjectId')
  @Perm('ledger:view')
  async detailLedger(
    @CurrentTid() tenantId: number,
    @Param('subjectId', ParseIntPipe) subjectId: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('fromMonth', ParseIntPipe) fromMonth: number,
    @Query('toMonth', ParseIntPipe) toMonth: number,
    @Query('format') format: 'xlsx' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data: any = await this.reports.detailLedger(tenantId, subjectId, year, fromMonth, toMonth);
    if (format === 'xlsx') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildDetailLedgerXlsx(tenant?.name || '', year, fromMonth, toMonth, data);
      sendXlsx(res, buf, `明细账-${year}-${String(fromMonth).padStart(2, '0')}-${String(toMonth).padStart(2, '0')}.xlsx`);
      return;
    }
    return data;
  }
}

/** 资产负债表 XLSX(三段式:资产 / 负债+权益) */
async function buildBsXlsx(company: string, year: number, month: number, data: any): Promise<Buffer> {
  const period = `${year}-${String(month).padStart(2, '0')}`;
  return await buildXlsx({
    filename: `资产负债表-${period}`,
    companyName: company,
    sheets: [
      {
        name: '资产负债表',
        columns: [
          { header: '资产类', key: 'a_name', width: 26 },
          { header: '行次', key: 'a_line', width: 8, align: 'center' },
          { header: '期末余额', key: 'a_cur', width: 18, numFmt: '0.00' },
          { header: '年初余额', key: 'a_open', width: 18, numFmt: '0.00' },
          { header: '负债与权益类', key: 'b_name', width: 26 },
          { header: '行次', key: 'b_line', width: 8, align: 'center' },
          { header: '期末余额', key: 'b_cur', width: 18, numFmt: '0.00' },
          { header: '年初余额', key: 'b_open', width: 18, numFmt: '0.00' },
        ],
        rows: (() => {
          const a = data?.assets?.items || [];
          const b = data?.liabEq?.items || [];
          const len = Math.max(a.length, b.length);
          const out: any[] = [];
          for (let i = 0; i < len; i++) {
            out.push({
              a_name: a[i]?.name || '', a_line: a[i]?.line || '',
              a_cur: a[i]?.cur != null ? Number(a[i].cur) : '',
              a_open: a[i]?.open != null ? Number(a[i].open) : '',
              b_name: b[i]?.name || '', b_line: b[i]?.line || '',
              b_cur: b[i]?.cur != null ? Number(b[i].cur) : '',
              b_open: b[i]?.open != null ? Number(b[i].open) : '',
            });
          }
          // 合计行
          out.push({
            a_name: '资产合计', a_line: '',
            a_cur: Number(data?.assets?.totalCur || 0), a_open: Number(data?.assets?.totalOpen || 0),
            b_name: '负债与权益合计', b_line: '',
            b_cur: Number(data?.liabEq?.totalCur || 0), b_open: Number(data?.liabEq?.totalOpen || 0),
          });
          return out;
        })(),
      },
    ],
  });
}

/** 利润表 XLSX */
async function buildIsXlsx(company: string, year: number, month: number, data: any): Promise<Buffer> {
  const period = `${year}-${String(month).padStart(2, '0')}`;
  return await buildXlsx({
    filename: `利润表-${period}`,
    companyName: company,
    sheets: [
      {
        name: '利润表',
        columns: [
          { header: '项目', key: 'name', width: 28 },
          { header: '行次', key: 'line', width: 8, align: 'center' },
          { header: '本期金额', key: 'cur', width: 18, numFmt: '0.00' },
          { header: '本年累计', key: 'cum', width: 18, numFmt: '0.00' },
        ],
        rows: (data?.rows || []).map((r: any) => ({
          name: r.name, line: r.line || '',
          cur: r.cur != null ? Number(r.cur) : '',
          cum: r.cum != null ? Number(r.cum) : '',
        })),
      },
    ],
  });
}

/** 科目余额表 XLSX */
async function buildSummaryXlsx(company: string, year: number, month: number, data: any): Promise<Buffer> {
  return await buildXlsx({
    filename: `科目余额表-${year}-${String(month).padStart(2, '0')}`,
    companyName: company,
    sheets: [{
      name: '余额表',
      columns: [
        { header: '科目编码', key: 'code', width: 14 },
        { header: '科目名称', key: 'name', width: 26 },
        { header: '期初借方', key: 'openDebit', width: 16, numFmt: '0.00' },
        { header: '期初贷方', key: 'openCredit', width: 16, numFmt: '0.00' },
        { header: '本期借方', key: 'curDebit', width: 16, numFmt: '0.00' },
        { header: '本期贷方', key: 'curCredit', width: 16, numFmt: '0.00' },
        { header: '期末借方', key: 'endDebit', width: 16, numFmt: '0.00' },
        { header: '期末贷方', key: 'endCredit', width: 16, numFmt: '0.00' },
      ],
      rows: (data?.rows || []).map((r: any) => ({
        code: r.code, name: r.name,
        openDebit: Number(r.openDebit || 0), openCredit: Number(r.openCredit || 0),
        curDebit: Number(r.curDebit || 0), curCredit: Number(r.curCredit || 0),
        endDebit: Number(r.endDebit || 0), endCredit: Number(r.endCredit || 0),
      })),
    }],
  });
}

/** 明细账 XLSX */
async function buildDetailLedgerXlsx(company: string, year: number, fromM: number, toM: number, data: any): Promise<Buffer> {
  return await buildXlsx({
    filename: `明细账-${year}-${fromM}-${toM}`,
    companyName: company,
    sheets: [{
      name: '明细账',
      columns: [
        { header: '日期', key: 'date', width: 14, align: 'center' },
        { header: '凭证号', key: 'voucher', width: 14, align: 'center' },
        { header: '摘要', key: 'summary', width: 30 },
        { header: '借方', key: 'debit', width: 16, numFmt: '0.00' },
        { header: '贷方', key: 'credit', width: 16, numFmt: '0.00' },
        { header: '方向', key: 'dir', width: 8, align: 'center' },
        { header: '余额', key: 'balance', width: 16, numFmt: '0.00' },
      ],
      rows: (data?.rows || []).map((r: any) => ({
        date: r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
        voucher: r.voucher || '',
        summary: r.summary || '',
        debit: Number(r.debit || 0), credit: Number(r.credit || 0),
        dir: r.dir || '', balance: Number(r.balance || 0),
      })),
    }],
  });
}


/** 现金流量表 xlsx */
async function buildCfXlsx(company: string, year: number, month: number, data: any) {
  return buildXlsx({
    filename: `现金流量表-${year}-${month}`,
    companyName: company,
    sheets: [{
      name: '现金流量表',
      columns: [
        { header: '行次', key: 'no', width: 8, align: 'center' },
        { header: '项目', key: 'name', width: 46 },
        { header: '本期金额', key: 'period', width: 18, numFmt: '#,##0.00' },
        { header: '本年累计', key: 'ytd', width: 18, numFmt: '#,##0.00' },
      ],
      rows: (data?.rows || []).map((r: any) => ({
        no: r.no,
        name: (r.bold ? '' : '  ') + r.name,
        period: Number(r.periodValue || 0),
        ytd: Number(r.ytdValue || 0),
      })),
    }],
  });
}
