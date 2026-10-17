import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createAttachmentStore, AttachmentStore } from '../../common/attachment-store';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { CurrentTid, CurrentUser, OpLog, Perm, SessionUser } from '../../common/decorators';
import { LedgerService, InitialItem } from './ledger.service';
import { VoucherService, VoucherInput } from './voucher.service';
import { ClosingService } from './closing.service';
import { PrismaService } from '../../prisma.service';
import { buildXlsx, sendXlsx, ResponseSentError } from '../../common/excel';

class InitialSaveDto {
  @IsArray()
  items!: InitialItem[];
}

class VoucherDto {
  @IsOptional()
  @IsString()
  word?: string;
  @IsString()
  date!: string;
  @IsOptional()
  @IsInt()
  attachmentCount?: number;
  @IsOptional()
  @IsString()
  memo?: string;
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

@Controller()
export class LedgerController {

  /** 附件存储驱动(本地/S3 按 ATTACHMENT_DRIVER 配置) */
  private readonly store: AttachmentStore = createAttachmentStore();
  constructor(
    private readonly ledger: LedgerService,
    private readonly vouchers: VoucherService,
    private readonly closing: ClosingService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== 期间与建账 ====================
  @Get('periods')
  periods(@CurrentTid() tenantId: number) {
    return this.ledger.periods(tenantId);
  }

  @Get('initial-balances')
  @Perm('ledger:view')
  initialBalances(@CurrentTid() tenantId: number) {
    return this.ledger.initialBalances(tenantId);
  }

  @Put('initial-balances')
  @Perm('ledger:init')
  @OpLog('保存期初余额')
  saveInitial(@CurrentTid() tenantId: number, @Body() dto: InitialSaveDto) {
    return this.ledger.saveInitialBalances(tenantId, dto.items || []);
  }

  @Post('tenants/activate')
  @Perm('ledger:init')
  @OpLog('启用账套')
  activate(@CurrentTid() tenantId: number) {
    return this.ledger.activateTenant(tenantId);
  }

  // ==================== 凭证 ====================
  @Get('vouchers')
  @Perm('ledger:view')
  async listVouchers(
    @CurrentTid() tenantId: number,
    @Query()
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
      format?: 'xlsx';
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Excel 导出模式:不分页,完整导出
    if (q.format === 'xlsx') {
      const list = await this.vouchers.listAll(tenantId, q);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '凭证列表',
        companyName: tenant?.name,
        sheets: [{
          name: '凭证',
          columns: [
            { header: '日期', key: 'date', width: 14, align: 'center' },
            { header: '凭证字号', key: 'no', width: 14, align: 'center' },
            { header: '摘要', key: 'summary', width: 30 },
            { header: '科目编码', key: 'subjectCode', width: 14 },
            { header: '科目名称', key: 'subjectName', width: 22 },
            { header: '借方', key: 'debit', width: 16, numFmt: '0.00' },
            { header: '贷方', key: 'credit', width: 16, numFmt: '0.00' },
            { header: '制单人', key: 'creator', width: 12 },
            { header: '审核人', key: 'auditor', width: 12 },
            { header: '状态', key: 'statusName', width: 12, align: 'center' },
            { header: '附件', key: 'attachmentCount', width: 8, align: 'right' },
          ],
          rows: list.flatMap((v: any) => {
            if (!v.entries?.length) {
              return [{
                date: v.date, no: `${v.word}-${v.no}`, summary: v.memo || '',
                subjectCode: '', subjectName: '',
                debit: Number(v.totalDebit), credit: Number(v.totalCredit),
                creator: v.creator?.realName, auditor: v.auditor?.realName,
                statusName: ['草稿', '待审核', '已记账', '已驳回', '已作废'][v.status] || '',
                attachmentCount: v.attachmentCount,
              }];
            }
            return v.entries.map((e: any) => ({
              date: v.date, no: `${v.word}-${v.no}`,
              summary: e.summary,
              subjectCode: e.subject?.code || '',
              subjectName: e.subject?.name || '',
              debit: Number(e.debit), credit: Number(e.credit),
              creator: v.creator?.realName, auditor: v.auditor?.realName,
              statusName: ['草稿', '待审核', '已记账', '已驳回', '已作废'][v.status] || '',
              attachmentCount: v.attachmentCount,
            }));
          }),
        }],
      });
      sendXlsx(res, buf, `凭证列表-${new Date().toISOString().slice(0,10)}.xlsx`);
      // ⚠️ sendXlsx 已 res.end,这里必须返回 undefined(经 envelope 包成 {code:0,data:null} 但已 res.end 不会有二次发送)
      // 因为 sendXlsx 在 envelope 之前已设 Content-Length 并 end,res 已 writable=false,再次 setHeader 会抛 ERR_HTTP_HEADERS_SENT
      // 解决办法:在 sendXlsx 中直接抛一个 marker 让 envelope 跳过
      return undefined as any;
    }
    return this.vouchers.list(tenantId, q);
  }

  // ===== 凭证模板与摘要联想(声明顺序须先于 vouchers/:id) =====

  @Get('vouchers/templates')
  @Perm('voucher:create')
  async listTemplates(@CurrentTid() tenantId: number) {
    const rows = await this.prisma.voucherTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { list: rows.map((r) => ({ id: r.id, name: r.name, word: r.word, memo: r.memo, entries: r.entries, createdAt: r.createdAt })) };
  }

  @Post('vouchers/templates')
  @Perm('voucher:create')
  @OpLog('voucher.template.save')
  async saveTemplate(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Body() body: { name: string; word?: string; memo?: string; entries: VoucherInput['entries'] },
  ) {
    if (!body?.name?.trim()) throw new BadRequestException('模板名称不能为空');
    if (!Array.isArray(body.entries) || body.entries.length < 2) throw new BadRequestException('模板分录至少两行');
    const t = await this.prisma.voucherTemplate.create({
      data: {
        tenantId,
        name: body.name.trim().slice(0, 50),
        word: body.word || '记',
        memo: body.memo?.slice(0, 200) ?? null,
        entries: body.entries as object,
        createdBy: user.uid,
      },
    });
    return { id: t.id, name: t.name };
  }

  @Delete('vouchers/templates/:id')
  @Perm('voucher:create')
  @OpLog('voucher.template.delete')
  async removeTemplate(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    const t = await this.prisma.voucherTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new BadRequestException('模板不存在');
    await this.prisma.voucherTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /** 摘要联想:该账套已记账凭证的常用摘要 top100 */
  @Get('vouchers/summaries')
  @Perm('voucher:create')
  async listSummaries(@CurrentTid() tenantId: number) {
    const rows = await this.prisma.$queryRawUnsafe<{ text: string; cnt: string }[]>(
      `SELECT e.summary AS text, COUNT(*)::text AS cnt
       FROM "VoucherEntry" e
       JOIN "Voucher" v ON v.id = e."voucherId"
       WHERE v."tenantId"=$1 AND v.status=2 AND e.summary IS NOT NULL AND e.summary <> ''
       GROUP BY e.summary ORDER BY COUNT(*) DESC, MAX(e.summary) ASC LIMIT 100`,
      tenantId,
    );
    return { list: rows.map((r) => ({ text: r.text, count: Number(r.cnt) })) };
  }

  /** 凭证 Excel 批量导入(列:日期|摘要|科目编码|借方金额|贷方金额;连续相同日期合为一张) */
  @Post('vouchers/import')
  @UseInterceptors(FileInterceptor('file'))
  @Perm('voucher:create')
  @OpLog('凭证批量导入')
  async importVouchers(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('导入文件不能超过 5MB');
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('无法解析 xlsx 文件,请使用下载的模板填写');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel 无工作表');

    const rawRows: Array<{ rowNo: number; date: string; summary: string; subjectCode: string; debit: number; credit: number; partnerName: string; deptName: string }> = [];
    let lastDate: string | null = null;
    ws.eachRow((row, rowNo) => {
      if (rowNo < 2) return; // 跳过表头
      const c = (idx: number) => {
        const cell = row.getCell(idx);
        if (cell.value instanceof Date) return cell.value;
        if (cell.value && typeof cell.value === 'object' && 'text' in (cell.value as any)) return String((cell.value as any).text);
        if (cell.value && typeof cell.value === 'object' && 'result' in (cell.value as any)) return Number((cell.value as any).result);
        return cell.value as any;
      };
      const dateRaw = c(1);
      const summary = String(c(2) ?? '').trim();
      const subjectCode = String(c(3) ?? '').trim();
      const debit = Number(c(4) ?? 0) || 0;
      const credit = Number(c(5) ?? 0) || 0;
      const partnerName = String(c(6) ?? '').trim();
      const deptName = String(c(7) ?? '').trim();
      if (!subjectCode && !debit && !credit) return; // 科目与金额全空(空行/说明行)跳过
      let date: string;
      if (dateRaw instanceof Date) {
        date = dateRaw.toISOString().slice(0, 10);
      } else if (!String(dateRaw ?? '').trim()) {
        // 空日期=沿用上一行(同张凭证的多行分录)
        if (!lastDate) throw new BadRequestException(`第 ${rowNo} 行缺少日期`);
        date = lastDate;
      } else {
        const d = new Date(String(dateRaw));
        if (isNaN(d.getTime())) throw new BadRequestException(`第 ${rowNo} 行日期格式错误(应为 YYYY-MM-DD)`);
        date = d.toISOString().slice(0, 10);
      }
      lastDate = date;
      rawRows.push({ rowNo, date, summary, subjectCode, debit, credit, partnerName, deptName });
    });
    if (!rawRows.length) throw new BadRequestException('未解析到有效数据行(模板表头:日期|摘要|科目编码|借方金额|贷方金额)');
    return this.vouchers.importBatch(tenantId, user.uid, rawRows);
  }

  /** 凭证导入模板下载 */
  @Get('vouchers/import-template')
  @Perm('voucher:create')
  async importTemplate(@CurrentTid() tenantId: number, @Res({ passthrough: true }) res: Response) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('凭证导入');
    ws.addRow(['日期', '摘要', '科目编码', '借方金额', '贷方金额', '往来单位', '部门']);
    ws.addRow(['2026-02-15', '收到货款', '100201', 10000, '', '华辰科技股份有限公司', '']);
    ws.addRow(['', '收到货款', '1122', '', 10000, '华辰科技股份有限公司', '']);
    ws.addRow(['2026-02-16', '支付办公费', '560201', 500, '', '', '综合部']);
    ws.addRow(['', '支付办公费', '1001', '', 500, '', '']);
    ws.addRow([]);
    const tip = ws.addRow(['说明:科目编码必须为末级(如 100201);日期相同的连续行合为一张凭证;空日期沿用上一行;金额仅填一侧;往来单位/部门按档案名称精确匹配,辅助核算科目必填。']);
    tip.font = { italic: true, size: 9, color: { argb: 'FF999999' } };
    ws.getRow(1).font = { bold: true };
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 22;
    ws.getColumn(7).width = 14;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="voucher-import-template.xlsx"`);
    res.send(Buffer.from(buf));
    throw new ResponseSentError();
  }

  @Get('vouchers/:id')
  @Perm('ledger:view')
  getVoucher(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vouchers.getOne(tenantId, id);
  }

  @Post('vouchers')
  @Perm('voucher:create')
  @OpLog('录入凭证')
  async createVoucher(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() body: VoucherDto & { entries: VoucherInput['entries'] }) {
    const created = await this.vouchers.create(
      tenantId,
      user.uid,
      { word: body.word, date: body.date, attachmentCount: body.attachmentCount, memo: body.memo, entries: body.entries },
      { submit: body.submit === true },
    );
    return created;
  }

  @Put('vouchers/:id')
  @Perm('voucher:create')
  @OpLog('修改凭证')
  async updateVoucher(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: VoucherDto & { entries: VoucherInput['entries'] },
  ) {
    return this.vouchers.update(tenantId, user.uid, id, {
      word: body.word,
      date: body.date,
      attachmentCount: body.attachmentCount,
      memo: body.memo,
      entries: body.entries,
    });
  }

  @Delete('vouchers/:id')
  @Perm('voucher:create')
  @OpLog('删除凭证草稿')
  removeVoucher(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vouchers.remove(tenantId, id);
  }

  @Post('vouchers/:id/submit')
  @HttpCode(200)
  @Perm('voucher:create')
  @OpLog('提交凭证审核')
  submit(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vouchers.submit(tenantId, id);
  }

  @Post('vouchers/:id/reject')
  @HttpCode(200)
  @Perm('voucher:audit')
  @OpLog('驳回凭证')
  reject(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: { reason?: string }) {
    return this.vouchers.reject(tenantId, user.uid, id, dto.reason || '驳回');
  }

  @Post('vouchers/:id/approve')
  @HttpCode(200)
  @Perm('voucher:audit')
  @OpLog('凭证审核记账')
  approve(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.vouchers.approve(tenantId, user.uid, id);
  }

  @Post('vouchers/:id/cancel-audit')
  @HttpCode(200)
  @Perm('voucher:audit')
  @OpLog('反审核凭证')
  cancelAudit(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vouchers.cancelAudit(tenantId, id);
  }

  @Post('vouchers/:id/void')
  @HttpCode(200)
  @Perm('voucher:create')
  @OpLog('作废凭证')
  voidVoucher(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vouchers.voidVoucher(tenantId, id);
  }

  @Post('vouchers/:id/red-flush')
  @HttpCode(200)
  @Perm('voucher:create')
  @OpLog('红冲凭证')
  redFlush(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: { date?: string }) {
    return this.vouchers.redFlush(tenantId, user.uid, id, dto?.date);
  }

  // ==================== 附件 ====================
  @Post('vouchers/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  @Perm('voucher:create')
  @OpLog('上传凭证附件')
  async uploadAttachment(
    @CurrentTid() _tenantId: number,
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('仅支持 jpg/png/pdf 附件');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('附件不能超过10MB');
    const attCount = await this.prisma.attachment.count({ where: { ownerType: 'voucher', ownerId: id } });
    if (attCount >= 20) throw new BadRequestException('单张凭证附件已达上限(20 个)');

    const key = this.store.resolveKey(file.mimetype);
    await this.store.put(key, file.buffer);

    return this.prisma.$transaction([
      this.prisma.attachment.create({
        data: {
          ownerType: 'voucher',
          ownerId: id,
          fileName: file.originalname,
          filePath: key,
          fileSize: file.size,
          contentType: file.mimetype,
          uploadedBy: user.uid,
        },
      }),
      this.prisma.voucher.update({
        where: { id },
        data: { attachmentCount: { increment: 1 } },
      }),
    ]).then(([att]) => att);
  }

  @Get('attachments/:id/download')
  @Perm('ledger:view', 'voucher:create', 'voucher:audit')
  async downloadAttachment(
    @CurrentTid() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('附件不存在');
    let content: Buffer;
    try {
      content = await this.store.get(att.filePath);
    } catch {
      throw new NotFoundException('附件不存在');
    }
    // 越权防御:校验附件所属业务(owner)的租户归属
    if (att.ownerType === 'voucher') {
      const v = await this.prisma.voucher.findFirst({ where: { id: att.ownerId, tenantId } });
      if (!v) throw new NotFoundException('附件不存在');
    } else if (att.ownerType === 'expense') {
      const c = await this.prisma.expenseClaim.findFirst({ where: { id: att.ownerId, tenantId } });
      if (!c) throw new NotFoundException('附件不存在');
    } else {
      // 未知类型:默认拒绝
      throw new NotFoundException('附件类型不支持下载');
    }
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.send(content);
    // 抛 marker 防止 EnvelopeInterceptor 再次包装
    throw new ResponseSentError();
  }

  // ==================== 期末处理 ====================
  @Get('closing/checklist')
  @Perm('ledger:view')
  checklist(@CurrentTid() tenantId: number, @Query('periodId', ParseIntPipe) periodId: number) {
    return this.closing.checklist(tenantId, periodId);
  }

  @Post('closing/close')
  @HttpCode(200)
  @Perm('closing:execute')
  @OpLog('期末结账')
  close(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: { periodId: number }) {
    return this.closing.close(tenantId, user.uid, dto.periodId);
  }

  @Post('closing/un-close')
  @HttpCode(200)
  @Perm('closing:execute')
  @OpLog('反结账')
  unclose(@CurrentTid() tenantId: number, @Body() dto: { periodId: number }) {
    return this.closing.unclose(tenantId, dto.periodId);
  }

  @Post('closing/profit-carryforward')
  @HttpCode(200)
  @Perm('closing:execute')
  @OpLog('结转损益')
  carryforward(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: { periodId: number }) {
    return this.closing.profitCarryforward(tenantId, user.uid, dto.periodId);
  }

  @Post('closing/depreciation')
  @HttpCode(200)
  @Perm('asset:manage')
  @OpLog('计提折旧')
  depreciate(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: { periodId: number }) {
    return this.closing.depreciate(tenantId, user.uid, dto.periodId);
  }
}
