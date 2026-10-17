import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentTid, OpLog, Perm } from '../../common/decorators';
import { MasterdataService } from './masterdata.service';
import { PrismaService } from '../../prisma.service';
import { buildXlsx, sendXlsx } from '../../common/excel';

class SubjectDto {
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsOptional()
  @IsObject()
  assist?: Record<string, boolean>;
  @IsOptional()
  @IsString()
  cashFlowType?: string;
  @IsOptional()
  @IsInt()
  status?: number;
}

class PartnerDto {
  @IsOptional()
  @IsInt()
  id?: number;
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsInt()
  @IsIn([1, 2])
  type!: number;
  @IsOptional()
  @IsString()
  taxNo?: string;
  @IsOptional()
  @IsString()
  bankName?: string;
  @IsOptional()
  @IsString()
  bankAccount?: string;
  @IsOptional()
  @IsString()
  contact?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsInt()
  creditDays?: number;
  @IsOptional()
  @IsInt()
  creditLimit?: number;
  @IsOptional()
  @IsInt()
  status?: number;
}

class SimpleArchiveDto {
  @IsOptional()
  @IsInt()
  id?: number;
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsOptional()
  @IsInt()
  deptId?: number;
  @IsOptional()
  @IsString()
  position?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsInt()
  status?: number;
}

@Controller()
export class MasterdataController {
  constructor(
    private readonly svc: MasterdataService,
    private readonly prisma: PrismaService,
  ) {}

  // ===== 科目 =====
  @Get('subjects/tree')
  @Perm('md:manage', 'voucher:create', 'voucher:audit', 'ledger:view', 'expense:create', 'expense:approve', 'expense:pay')
  subjectTree(@CurrentTid() tenantId: number) {
    return this.svc.subjectTree(tenantId);
  }

  @Get('subjects/list')
  @Perm('md:manage')
  async subjectList(
    @CurrentTid() tenantId: number,
    @Query() q: { format?: 'xlsx' },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'xlsx') {
      const list = await this.svc.subjectListAll(tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '会计科目表',
        companyName: tenant?.name,
        sheets: [{
          name: '科目',
          columns: [
            { header: '科目编码', key: 'code', width: 14 },
            { header: '科目名称', key: 'name', width: 26 },
            { header: '类别', key: 'category', width: 10, align: 'center' },
            { header: '余额方向', key: 'balanceDir', width: 10, align: 'center' },
            { header: '辅助核算', key: 'auxType', width: 14, align: 'center' },
            { header: '是否末级', key: 'isLeaf', width: 10, align: 'center' },
            { header: '上级编码', key: 'parentCode', width: 14 },
            { header: '状态', key: 'status', width: 10, align: 'center' },
          ],
          rows: list.map((s: any) => ({
            code: s.code, name: s.name,
            category: ({ 1: '资产', 2: '负债', 3: '权益', 4: '成本', 5: '损益' } as Record<number, string>)[s.category] || String(s.category),
            balanceDir: s.balanceDir === 'D' ? '借' : '贷',
            auxType: ({ 0: '无', 1: '部门', 2: '项目', 3: '往来' } as Record<number, string>)[s.auxType] || String(s.auxType),
            isLeaf: s.isLeaf ? '是' : '否',
            parentCode: s.parentCode || '',
            status: s.status === 1 ? '启用' : '停用',
          })),
        }],
      });
      sendXlsx(res, buf, `会计科目表-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.svc.subjectTree(tenantId);
  }

  @Post('subjects')
  @Perm('md:manage')
  @OpLog('新增科目')
  createSubject(@CurrentTid() tenantId: number, @Body() dto: SubjectDto) {
    return this.svc.createSubject(tenantId, dto);
  }

  @Put('subjects/:id')
  @Perm('md:manage')
  @OpLog('修改科目')
  updateSubject(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: SubjectDto) {
    return this.svc.updateSubject(tenantId, id, dto);
  }

  // ===== 往来单位 =====
  @Get('partners')
  @Perm('md:manage', 'arap:manage', 'voucher:create', 'voucher:audit', 'expense:create', 'expense:approve')
  async partners(
    @CurrentTid() tenantId: number,
    @Query() q: { page?: number; pageSize?: number; type?: number; keyword?: string; format?: 'xlsx' },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'xlsx') {
      const list = await this.svc.partnersAll(tenantId, q);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '往来单位',
        companyName: tenant?.name,
        sheets: [{
          name: '往来单位',
          columns: [
            { header: '编号', key: 'code', width: 14 },
            { header: '名称', key: 'name', width: 28 },
            { header: '类型', key: 'typeName', width: 10, align: 'center' },
            { header: '税号', key: 'taxNo', width: 20 },
            { header: '电话', key: 'phone', width: 16 },
            { header: '地址', key: 'address', width: 30 },
            { header: '状态', key: 'status', width: 10, align: 'center' },
          ],
          rows: list.map((p: any) => ({
            code: p.code, name: p.name,
            typeName: p.type === 1 ? '客户' : p.type === 2 ? '供应商' : '其他',
            taxNo: p.taxNo || '', phone: p.phone || '', address: p.address || '',
            status: p.status === 1 ? '启用' : '停用',
          })),
        }],
      });
      sendXlsx(res, buf, `往来单位-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.svc.partners(tenantId, q);
  }

  @Post('partners')
  @Perm('md:manage')
  @OpLog('保存往来单位')
  savePartner(@CurrentTid() tenantId: number, @Body() dto: PartnerDto) {
    return this.svc.savePartner(tenantId, dto);
  }

  @Delete('partners/:id')
  @Perm('md:manage')
  @OpLog('删除往来单位')
  removePartner(@CurrentTid() tenantId: number, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removePartner(tenantId, id);
  }

  // ===== 部门/项目/员工 =====
  @Get('departments')
  @Perm('md:manage', 'voucher:create', 'expense:create')
  async departments(@CurrentTid() tenantId: number, @Query('format') format: 'xlsx' | undefined, @Res({ passthrough: true }) res: Response) {
    if (format === 'xlsx') {
      const list = await this.svc.departmentsAll(tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '部门档案',
        companyName: tenant?.name,
        sheets: [{
          name: '部门',
          columns: [
            { header: '编码', key: 'code', width: 14 },
            { header: '名称', key: 'name', width: 22 },
            { header: '上级', key: 'parentName', width: 18 },
            { header: '负责人', key: 'leader', width: 12 },
            { header: '备注', key: 'memo', width: 30 },
          ],
          rows: list.map((d: any) => ({ code: d.code, name: d.name, parentName: '', leader: '', memo: '' })),
        }],
      });
      sendXlsx(res, buf, `部门档案-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.svc.departments(tenantId);
  }

  @Post('departments')
  @Perm('md:manage')
  @OpLog('保存部门')
  saveDepartment(@CurrentTid() tenantId: number, @Body() dto: SimpleArchiveDto) {
    return this.svc.saveDepartment(tenantId, dto);
  }

  @Get('projects')
  @Perm('md:manage')
  async projects(@CurrentTid() tenantId: number, @Query('format') format: 'xlsx' | undefined, @Res({ passthrough: true }) res: Response) {
    if (format === 'xlsx') {
      const list = await this.svc.projectsAll(tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '项目档案',
        companyName: tenant?.name,
        sheets: [{
          name: '项目',
          columns: [
            { header: '编码', key: 'code', width: 14 },
            { header: '名称', key: 'name', width: 26 },
            { header: '负责人', key: 'manager', width: 12 },
            { header: '开始日期', key: 'startDate', width: 14, align: 'center' },
            { header: '结束日期', key: 'endDate', width: 14, align: 'center' },
            { header: '状态', key: 'status', width: 10, align: 'center' },
          ],
          rows: list.map((p: any) => ({
            code: p.code, name: p.name, manager: p.manager || '',
            startDate: p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : '',
            endDate: p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : '',
            status: p.status === 1 ? '进行中' : p.status === 2 ? '已完工' : '停用',
          })),
        }],
      });
      sendXlsx(res, buf, `项目档案-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.svc.projects(tenantId);
  }

  @Post('projects')
  @Perm('md:manage')
  @OpLog('保存项目')
  saveProject(@CurrentTid() tenantId: number, @Body() dto: SimpleArchiveDto) {
    return this.svc.saveProject(tenantId, dto);
  }

  @Get('employees')
  @Perm('md:manage')
  async employees(@CurrentTid() tenantId: number, @Query('format') format: 'xlsx' | undefined, @Res({ passthrough: true }) res: Response) {
    if (format === 'xlsx') {
      const list = await this.svc.employeesAll(tenantId);
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const buf = await buildXlsx({
        filename: '员工档案',
        companyName: tenant?.name,
        sheets: [{
          name: '员工',
          columns: [
            { header: '编号', key: 'code', width: 14 },
            { header: '姓名', key: 'name', width: 14 },
            { header: '部门', key: 'deptName', width: 18 },
            { header: '岗位', key: 'position', width: 16 },
            { header: '手机', key: 'phone', width: 14 },
            { header: '入职日期', key: 'hireDate', width: 14, align: 'center' },
            { header: '状态', key: 'status', width: 10, align: 'center' },
          ],
          rows: list.map((e: any) => ({
            code: e.code, name: e.name, deptName: e.deptName || '',
            position: e.position || '', phone: e.phone || '',
            hireDate: e.hireDate ? new Date(e.hireDate).toISOString().slice(0, 10) : '',
            status: e.status === 1 ? '在职' : '离职',
          })),
        }],
      });
      sendXlsx(res, buf, `员工档案-${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    return this.svc.employees(tenantId);
  }

  @Post('employees')
  @Perm('md:manage')
  @OpLog('保存员工')
  saveEmployee(@CurrentTid() tenantId: number, @Body() dto: SimpleArchiveDto) {
    return this.svc.saveEmployee(tenantId, dto);
  }

  // ===== 常用摘要 =====
  @Get('summaries')
  summaries(@CurrentTid() tenantId: number) {
    return this.svc.summaries(tenantId);
  }

  @Post('summaries')
  addSummary(@CurrentTid() tenantId: number, @Body() dto: { text: string }) {
    return this.svc.addSummary(tenantId, dto.text);
  }
}
