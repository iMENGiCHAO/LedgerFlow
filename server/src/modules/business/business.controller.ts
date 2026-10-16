import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentTid, CurrentUser, OpLog, Perm, SessionUser } from '../../common/decorators';
import { ArapService } from './arap.service';
import { InvoiceService } from './invoice.service';
import { PayrollService } from './payroll.service';
import { FundService } from './fund.service';
import { ExpenseService } from './expense.service';
import { AssetService } from './asset.service';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma.service';
import { buildXlsx, sendXlsx, ExcelSheet } from '../../common/excel';

class BillDto {
  @IsInt()
  @IsIn([1, 2, 3, 4])
  type!: number;
  @IsInt()
  partnerId!: number;
  @IsString()
  date!: string;
  @IsOptional()
  @IsString()
  dueDate?: string;
  @IsNumber()
  amount!: number;
  @IsOptional()
  @IsString()
  memo?: string;
  @IsOptional()
  @IsString()
  settleType?: string;
  @IsOptional()
  @IsString()
  settleNo?: string;
  @IsOptional()
  @IsString()
  settleSubjectCode?: string;
  @IsOptional()
  @IsBooleanLike()
  generateVoucher?: boolean;
}
function IsBooleanLike() {
  return function (target: object, propertyKey: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { IsBoolean } = require('class-validator');
    IsBoolean()(target, propertyKey);
  };
}

class WriteoffDto {
  @IsInt()
  openBillId!: number;
  @IsInt()
  settleBillId!: number;
  @IsNumber()
  amount!: number;
}

class InvoiceDto {
  @IsOptional()
  @IsInt()
  id?: number;
  @IsInt()
  @IsIn([1, 2])
  io!: number;
  @IsString()
  invoiceNo!: string;
  @IsOptional()
  @IsString()
  partnerCode?: string;
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsString()
  itemName?: string;
  @IsString()
  date!: string;
  @IsNumber()
  amount!: number;
  @IsNumber()
  taxRate!: number;
}

class AccountDto {
  @IsOptional()
  @IsInt()
  id?: number;
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  bankName?: string;
  @IsOptional()
  @IsString()
  accountNo?: string;
  @IsString()
  subjectCode!: string;
}

class ClaimDto {
  @IsString()
  title!: string;
  @IsOptional()
  @IsInt()
  deptId?: number;
  @IsOptional()
  @IsInt()
  projectId?: number;
  @IsArray()
  items!: { expenseType: string; occurDate: string; amount: number; invoiceCount: number; invoiceTotal?: number; remark?: string }[];
}

class AssetDto {
  @IsString()
  name!: string;
  @IsString()
  category!: string;
  @IsString()
  acquiredDate!: string;
  @IsNumber()
  originalValue!: number;
  @IsOptional()
  @IsNumber()
  salvageRate?: number;
  @IsInt()
  lifeMonths!: number;
  @IsOptional()
  @IsInt()
  useDeptId?: number;
  @IsOptional()
  @IsString()
  location?: string;
  @IsOptional()
  @IsString()
  depExpenseSubjectCode?: string;
  @IsOptional()
  @IsBooleanLike()
  generateVoucher?: boolean;
}

@Controller()
export class BusinessController {
  constructor(
    private readonly arap: ArapService,
    private readonly invoices: InvoiceService,
    private readonly fund: FundService,
    private readonly expense: ExpenseService,
    private readonly assets: AssetService,
    private readonly dashboard: DashboardService,
    private readonly prisma: PrismaService,
    private readonly payrolls: PayrollService,
  ) {}

  // ==================== 应收应付 ====================
  @Get('arap/bills')
  @Perm('arap:manage')
  async bills(
    @CurrentTid() tenantId: number,
    @Query() q: { page?: number; pageSize?: number; type?: number; partnerId?: number; settled?: string; keyword?: string; format?: 'xlsx' },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'xlsx') {
      const list = await this.arap.listAll(tenantId, q);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '应收应付明细',
        companyName: tenant?.name,
        sheets: [{
          name: '应收应付',
          columns: [
            { header: '单据类型', key: 'typeName', width: 12, align: 'center' },
            { header: '单号', key: 'billNo', width: 18, align: 'center' },
            { header: '往来单位', key: 'partnerName', width: 24 },
            { header: '日期', key: 'date', width: 14, align: 'center' },
            { header: '到期日', key: 'dueDate', width: 14, align: 'center' },
            { header: '金额', key: 'amount', width: 16, numFmt: '0.00' },
            { header: '已核销', key: 'writtenOff', width: 16, numFmt: '0.00' },
            { header: '未核销', key: 'pending', width: 16, numFmt: '0.00' },
            { header: '结算方式', key: 'settleType', width: 12 },
            { header: '备注', key: 'memo', width: 30 },
          ],
          rows: list.map((b: any) => ({
            typeName: b.type === 1 ? '应收' : b.type === 2 ? '应付' : b.type === 3 ? '预收' : '预付',
            billNo: b.billNo,
            partnerName: b.partner?.name || '',
            date: b.date ? new Date(b.date).toISOString().slice(0, 10) : '',
            dueDate: b.dueDate ? new Date(b.dueDate).toISOString().slice(0, 10) : '',
            amount: Number(b.amount),
            writtenOff: Number(b.writtenOff),
            pending: Number(b.amount) - Number(b.writtenOff),
            settleType: b.settleType || '',
            memo: b.memo || '',
          })),
        }],
      });
      sendXlsx(res, buf, `应收应付明细-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.arap.list(tenantId, q);
  }

  @Post('arap/bills')
  @Perm('arap:manage')
  @OpLog('登记应收应付单据')
  createBill(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: BillDto) {
    return this.arap.createBill(tenantId, user.uid, dto);
  }

  @Delete('arap/bills/:id')
  @Perm('arap:manage')
  @OpLog('删除应收应付单据')
  removeBill(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.arap.removeBill(tenantId, id);
  }

  @Post('arap/writeoffs')
  @HttpCode(200)
  @Perm('arap:manage')
  @OpLog('往来核销')
  writeoff(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: WriteoffDto) {
    return this.arap.writeoff(tenantId, user.uid, dto);
  }

  @Get('arap/aging')
  @Perm('ledger:view')
  aging(@CurrentTid() tenantId: number, @Query('type') type: string) {
    return this.arap.aging(tenantId, Number(type) === 3 ? 3 : 1);
  }

  // ==================== 发票 ====================
  @Get('invoices')
  @Perm('invoice:manage')
  async invoiceList(
    @CurrentTid() tenantId: number,
    @Query() q: { page?: number; pageSize?: number; io?: number; keyword?: string; from?: string; to?: string; format?: 'xlsx' },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'xlsx') {
      const list = await this.invoices.listAll(tenantId, q);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '发票台账',
        companyName: tenant?.name,
        sheets: [{
          name: '发票',
          columns: [
            { header: '方向', key: 'ioName', width: 10, align: 'center' },
            { header: '发票号', key: 'invoiceNo', width: 18 },
            { header: '开票日期', key: 'date', width: 14, align: 'center' },
            { header: '购方/销方', key: 'partnerName', width: 28 },
            { header: '商品/服务', key: 'title', width: 24 },
            { header: '金额(含税)', key: 'amount', width: 16, numFmt: '0.00' },
            { header: '税额', key: 'tax', width: 14, numFmt: '0.00' },
            { header: '税率', key: 'rate', width: 10, align: 'right', numFmt: '0.00%' },
            { header: '备注', key: 'memo', width: 30 },
          ],
          rows: list.map((i: any) => ({
            ioName: i.io === 1 ? '进项' : '销项',
            invoiceNo: i.invoiceNo,
            date: i.date ? new Date(i.date).toISOString().slice(0, 10) : '',
            partnerName: i.partner?.name || '',
            title: i.title || '',
            amount: Number(i.amount),
            tax: Number(i.tax),
            rate: Number(i.rate),
            memo: i.memo || '',
          })),
        }],
      });
      sendXlsx(res, buf, `发票台账-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.invoices.list(tenantId, q);
  }

  @Post('invoices')
  @Perm('invoice:manage')
  @OpLog('登记发票')
  saveInvoice(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: InvoiceDto) {
    return this.invoices.save(tenantId, user.uid, dto);
  }

  @Post('invoices/import-csv')
  @HttpCode(200)
  @Perm('invoice:manage')
  @OpLog('批量导入发票')
  importInvoices(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: { csv: string }) {
    return this.invoices.importCsv(tenantId, user.uid, dto.csv);
  }

  @Post('invoices/:id/to-receivable')
  @HttpCode(200)
  @Perm('invoice:manage')
  @OpLog('销项发票生成应收单')
  toReceivable(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.invoices.toReceivable(tenantId, user.uid, id);
  }

  @Delete('invoices/:id')
  @Perm('invoice:manage')
  @OpLog('删除发票登记')
  removeInvoice(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.invoices.remove(tenantId, id);
  }

  @Get('invoices/vat-summary')
  @Perm('report:view')
  vatSummary(@CurrentTid() tenantId: number, @Query('year', ParseIntPipe) year: number) {
    return this.invoices.vatSummary(tenantId, year);
  }

  /** 增值税申报测算(季度,按税率分组;format=xlsx 导出表样) */
  @Get('invoices/vat-declaration')
  @Perm('report:view')
  async vatDeclaration(
    @CurrentTid() tenantId: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('quarter', ParseIntPipe) quarter: number,
    @Query('format') format: 'xlsx' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.invoices.vatDeclaration(tenantId, year, quarter);
    if (format === 'xlsx') {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildVatXlsx(tenant?.name || '', data);
      sendXlsx(res, buf, `增值税申报测算-${year}Q${quarter}.xlsx`);
      return;
    }
    return data;
  }

  // ==================== 工资核算 ====================

  /** 查询/初始化月度工资批次(行按在册员工生成,金额待录入) */
  @Get('payrolls')
  @Perm('payroll:manage')
  async payrollBatch(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.payrolls.batch(tenantId, year, month, user.uid);
  }

  /** 批量保存工资行 */
  @Post('payrolls/:id/items')
  @HttpCode(200)
  @Perm('payroll:manage')
  @OpLog('工资单保存')
  savePayrollItems(
    @CurrentTid() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { items: Array<{ employeeId: number; gross: number; socialIns?: number; tax?: number; otherDed?: number; remark?: string }> },
  ) {
    return this.payrolls.saveItems(tenantId, id, body.items || []);
  }

  /** 计提工资(生成凭证 借560204/贷2211,提交待审) */
  @Post('payrolls/:id/accrue')
  @HttpCode(200)
  @Perm('payroll:manage')
  @OpLog('工资计提')
  accruePayroll(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.payrolls.accrue(tenantId, id, user.uid);
  }

  /** 发放工资(生成凭证 借2211/贷100201 实发/贷2241 代扣) */
  @Post('payrolls/:id/pay')
  @HttpCode(200)
  @Perm('payroll:manage')
  @OpLog('工资发放')
  payPayroll(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.payrolls.pay(tenantId, id, user.uid);
  }

  // ==================== 资金管理 ====================
  @Get('fund/accounts')
  @Perm('fund:manage')
  async accounts(@CurrentTid() tenantId: number, @Query('format') format: 'xlsx' | undefined, @Res({ passthrough: true }) res: Response) {
    if (format === 'xlsx') {
      const list = await this.fund.accounts(tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '资金账户',
        companyName: tenant?.name,
        sheets: [{
          name: '账户',
          columns: [
            { header: '账户编号', key: 'code', width: 14 },
            { header: '账户名称', key: 'name', width: 24 },
            { header: '类型', key: 'typeName', width: 12, align: 'center' },
            { header: '币种', key: 'currency', width: 8, align: 'center' },
            { header: '期初余额', key: 'opening', width: 16, numFmt: '0.00' },
            { header: '当前余额', key: 'balance', width: 16, numFmt: '0.00' },
            { header: '所属科目', key: 'subjectName', width: 22 },
            { header: '状态', key: 'statusName', width: 10, align: 'center' },
            { header: '备注', key: 'memo', width: 30 },
          ],
          rows: list.map((a: any) => ({
            code: a.code, name: a.name,
            typeName: ({ 1: '现金', 2: '银行', 3: '其他货币' } as Record<number, string>)[a.type] || String(a.type),
            currency: a.currency || 'CNY',
            opening: Number(a.opening || 0),
            balance: Number(a.balance || 0),
            subjectName: a.subject?.name || '',
            statusName: a.status === 1 ? '启用' : '停用',
            memo: a.memo || '',
          })),
        }],
      });
      sendXlsx(res, buf, `资金账户-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.fund.accounts(tenantId);
  }

  @Post('fund/accounts')
  @Perm('fund:manage')
  @OpLog('保存资金账户')
  saveAccount(@CurrentTid() tenantId: number, @Body() dto: AccountDto) {
    return this.fund.saveAccount(tenantId, dto);
  }

  @Get('fund/journals')
  @Perm('fund:manage')
  journals(
    @CurrentTid() tenantId: number,
    @Query() q: { accountId?: number; year?: number; month?: number; keyword?: string; page?: number; pageSize?: number },
  ) {
    return this.fund.journals(tenantId, q);
  }

  @Post('fund/statements/import')
  @HttpCode(200)
  @Perm('fund:manage')
  @OpLog('导入银行对账单')
  importStatement(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: { accountId: number; csv: string }) {
    return this.fund.importStatement(tenantId, user.uid, dto);
  }

  @Get('fund/statements')
  @Perm('fund:manage')
  statementLines(@CurrentTid() tenantId: number, @Query('accountId', ParseIntPipe) accountId: number, @Query('matched') matched?: string) {
    return this.fund.statementLines(tenantId, accountId, matched);
  }

  @Post('fund/reconciliations/auto-match')
  @HttpCode(200)
  @Perm('fund:manage')
  @OpLog('银行对账自动勾兑')
  autoMatch(@CurrentTid() tenantId: number, @Body() dto: { accountId: number }) {
    return this.fund.autoMatch(tenantId, dto.accountId);
  }

  @Post('fund/reconciliations/manual-match')
  @HttpCode(200)
  @Perm('fund:manage')
  @OpLog('银行对账手工勾兑')
  manualMatch(@CurrentTid() tenantId: number, @Body() dto: { lineId: number; entryId: number | null }) {
    return this.fund.manualMatch(tenantId, dto.lineId, dto.entryId);
  }

  @Get('fund/reconciliation')
  @Perm('fund:manage')
  reconciliation(
    @CurrentTid() tenantId: number,
    @Query('accountId', ParseIntPipe) accountId: number,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.fund.reconciliation(tenantId, accountId, year, month);
  }

  // ==================== 费用报销 ====================
  @Get('expense-claims')
  @Perm('expense:create', 'expense:approve', 'expense:pay')
  async claims(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Query() q: { page?: number; pageSize?: number; status?: number; scope?: string; keyword?: string; format?: 'xlsx' },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'xlsx') {
      const rows = await this.expense.listAll(tenantId, { uid: user.uid, isSuper: user.isSuper, perms: user.perms }, q);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '费用报销',
        companyName: tenant?.name,
        sheets: [{
          name: '报销单',
          columns: [
            { header: '单号', key: 'no', width: 16 },
            { header: '申请人', key: 'creator', width: 12 },
            { header: '部门', key: 'deptName', width: 14 },
            { header: '状态', key: 'statusName', width: 12, align: 'center' },
            { header: '当前节点', key: 'currentNode', width: 18 },
            { header: '金额', key: 'total', width: 14, numFmt: '0.00' },
            { header: '提交时间', key: 'submittedAt', width: 16, align: 'center' },
            { header: '完成时间', key: 'paidAt', width: 16, align: 'center' },
            { header: '摘要', key: 'summary', width: 30 },
          ],
          rows: rows.map((r: any) => ({
            no: r.claimNo, creator: r.creator?.realName || '', deptName: r.deptName || '',
            statusName: ['草稿', '待总经理', '待财务', '—', '待出纳', '已付款', '已驳回', '已撤回'][r.status] || r.status,
            currentNode: r.currentNode || '',
            total: Number(r.total),
            submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
            paidAt: r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 16).replace('T', ' ') : '',
            summary: r.summary || '',
          })),
        }],
      });
      sendXlsx(res, buf, `费用报销-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.expense.list(tenantId, { uid: user.uid, isSuper: user.isSuper, perms: user.perms }, q);
  }

  @Get('expense-claims/:id')
  @Perm('expense:create', 'expense:approve', 'expense:pay')
  claimDetail(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.expense.detail(tenantId, id);
  }

  @Post('expense-claims')
  @Perm('expense:create')
  @OpLog('填报报销单')
  createClaim(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: ClaimDto) {
    return this.expense.create(tenantId, user.uid, dto);
  }

  @Put('expense-claims/:id')
  @Perm('expense:create')
  @OpLog('修改报销单')
  updateClaim(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<ClaimDto>,
  ) {
    return this.expense.update(tenantId, user.uid, id, dto);
  }

  @Post('expense-claims/:id/submit')
  @HttpCode(200)
  @Perm('expense:create')
  @OpLog('提交报销单')
  submitClaim(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.expense.submit(tenantId, user.uid, id);
  }

  @Post('expense-claims/:id/decide')
  @HttpCode(200)
  @Perm('expense:approve')
  @OpLog('审批报销单')
  decideClaim(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { action: 'approve' | 'reject'; opinion?: string },
  ) {
    return this.expense.decide(tenantId, { uid: user.uid, realName: user.realName, isSuper: user.isSuper, perms: user.perms }, id, dto.action, dto.opinion);
  }

  @Post('expense-claims/:id/pay')
  @HttpCode(200)
  @Perm('expense:pay')
  @OpLog('报销付款')
  payClaim(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { settleSubjectCode: string; settleType?: string; date?: string },
  ) {
    return this.expense.pay(tenantId, { uid: user.uid, realName: user.realName }, id, dto);
  }

  @Post('expense-claims/:id/withdraw')
  @HttpCode(200)
  @Perm('expense:create')
  @OpLog('撤回报销单')
  withdrawClaim(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.expense.withdraw(tenantId, user.uid, id);
  }

  // ==================== 固定资产 ====================
  @Get('assets')
  @Perm('asset:manage')
  async assetList(
    @CurrentTid() tenantId: number,
    @Query() q: { keyword?: string; status?: number; format?: 'xlsx' },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'xlsx') {
      const list = await this.assets.listAll(tenantId, q);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '固定资产卡片',
        companyName: tenant?.name,
        sheets: [{
          name: '资产',
          columns: [
            { header: '资产编号', key: 'code', width: 14 },
            { header: '名称', key: 'name', width: 22 },
            { header: '类别', key: 'categoryName', width: 12 },
            { header: '购置日期', key: 'acquiredAt', width: 14, align: 'center' },
            { header: '原值', key: 'originalValue', width: 16, numFmt: '0.00' },
            { header: '累计折旧', key: 'depreciation', width: 16, numFmt: '0.00' },
            { header: '净值', key: 'netValue', width: 16, numFmt: '0.00' },
            { header: '使用部门', key: 'deptName', width: 18 },
            { header: '状态', key: 'statusName', width: 10, align: 'center' },
          ],
          rows: list.map((a: any) => ({
            code: a.code, name: a.name,
            categoryName: a.category || '',
            acquiredAt: a.acquiredAt ? new Date(a.acquiredAt).toISOString().slice(0, 10) : '',
            originalValue: Number(a.originalValue),
            depreciation: Number(a.depreciation || 0),
            netValue: Number(a.netValue || a.originalValue),
            deptName: a.department?.name || '',
            statusName: a.status === 2 ? '已处置' : a.status === 1 ? '在用' : '停用',
          })),
        }],
      });
      sendXlsx(res, buf, `固定资产卡片-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.assets.list(tenantId, q);
  }

  @Post('assets')
  @Perm('asset:manage')
  @OpLog('新增固定资产卡片')
  createAsset(@CurrentTid() tenantId: number, @CurrentUser() user: SessionUser, @Body() dto: AssetDto) {
    return this.assets.create(tenantId, user.uid, dto);
  }

  @Put('assets/:id')
  @Perm('asset:manage')
  @OpLog('修改资产卡片')
  updateAsset(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: Partial<AssetDto>) {
    return this.assets.update(tenantId, id, dto);
  }

  @Post('assets/:id/dispose')
  @HttpCode(200)
  @Perm('asset:manage')
  @OpLog('固定资产处置')
  disposeAsset(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { disposeDate: string; disposeType: '出售' | '报废'; disposeAmount?: number; settleSubjectCode?: string },
  ) {
    return this.assets.dispose(tenantId, user.uid, id, dto);
  }

  // ==================== 看板 ====================
  @Get('dashboard/summary')
  @Perm('dashboard:view')
  dashboardSummary(@CurrentTid() tenantId: number) {
    return this.dashboard.summaryCached(tenantId);
  }
}

/** 增值税申报测算 xlsx(销项/进项分组 + 测算结论) */
async function buildVatXlsx(company: string, data: any) {
  const r2v = (x: number) => Math.round(x * 100) / 100;
  const sheet = (name: string, amountLabel: string, groups: any[], amountTotal: number, taxTotal: number): ExcelSheet => ({
    name,
    columns: [
      { header: '税率/征收率', key: 'rate', width: 14, align: 'center', format: (r: any) => (r.count === '' ? '合计' : (r.rate * 100).toFixed(2) + '%') },
      { header: '发票张数', key: 'count', width: 12, align: 'center' },
      { header: amountLabel, key: 'amount', width: 18, numFmt: '#,##0.00' },
      { header: '税额', key: 'tax', width: 16, numFmt: '#,##0.00' },
      { header: '价税合计', key: 'total', width: 18, numFmt: '#,##0.00' },
    ],
    rows: [
      ...groups.map((g: any) => ({ rate: g.rate, count: g.count, amount: g.amount, tax: g.tax, total: g.total })),
      { rate: 0, count: '', amount: amountTotal, tax: taxTotal, total: r2v(amountTotal + taxTotal) },
    ],
  });
  const calcRows: any[] = [
    { item: '一般纳税人口径:应纳增值税 = 销项税额 - 可抵扣进项税额', value: data.calc.generalPayable },
  ];
  if (data.calc.isSmallScale) {
    calcRows.push({ item: '小规模口径:不含税销售额 x 征收率(' + (data.calc.levyRate * 100).toFixed(1) + '%)', value: data.calc.smallPayable });
  }
  calcRows.push({ item: '发票总张数', value: data.invoiceCount });
  return buildXlsx({
    filename: '增值税申报测算-' + data.year + 'Q' + data.quarter,
    companyName: company,
    sheets: [
      sheet('销项汇总', '不含税销售额', data.sales.groups, data.sales.amountTotal, data.sales.taxTotal),
      sheet('进项汇总', '不含税采购额', data.purchase.groups, data.purchase.amountTotal, data.purchase.taxTotal),
      {
        name: '测算结论',
        columns: [
          { header: '项目', key: 'item', width: 56 },
          { header: '金额/数值', key: 'value', width: 18, numFmt: '0.00' },
        ],
        rows: calcRows.map((r: any) => ({ item: r.item, value: typeof r.value === 'number' ? r.value : String(r.value) })),
      },
    ],
  });
}
