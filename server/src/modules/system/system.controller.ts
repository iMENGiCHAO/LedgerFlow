import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { createReadStream } from 'fs';
import { CurrentUser, OpLog, Perm, Public, SessionUser, CurrentTid } from '../../common/decorators';
import { PrismaService } from '../../prisma.service';
import { SystemService } from './system.service';

class CreateUserDto {
  @IsString()
  username!: string;
  @IsString()
  @MinLength(6)
  password!: string;
  @IsString()
  realName!: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsBoolean()
  isSuper?: boolean;
  @IsOptional()
  @IsInt()
  deptId?: number | null;
  @IsOptional()
  @IsArray()
  roleIds?: number[];
  @IsOptional()
  @IsArray()
  tenantIds?: number[];
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  realName?: string;
  @IsOptional()
  @IsString()
  phone?: string;
  @IsOptional()
  @IsString()
  email?: string;
  @IsOptional()
  @IsInt()
  status?: number;
  @IsOptional()
  @IsBoolean()
  isSuper?: boolean;
  @IsOptional()
  @IsInt()
  deptId?: number | null;
  @IsOptional()
  @IsArray()
  roleIds?: number[];
  @IsOptional()
  @IsArray()
  tenantIds?: number[];
}

class RoleDto {
  @IsString()
  code!: string;
  @IsString()
  name!: string;
  @IsArray()
  permissions!: string[];
  @IsOptional()
  @IsString()
  remark?: string;
}

class TenantDto {
  @IsString()
  name!: string;
  @IsOptional()
  @IsString()
  taxNo?: string;
  @IsOptional()
  @IsString()
  address?: string;
  @IsOptional()
  @IsString()
  legalRep?: string;
  @IsInt()
  startYear!: number;
  @IsInt()
  startMonth!: number;
}

@Controller()
export class SystemController {
  constructor(
    private readonly svc: SystemService,
    private readonly prisma: PrismaService,
  ) {}

  // ===== 用户 =====
  @Get('users')
  @Perm('system:user')
  users(@Query() q: { page?: number; pageSize?: number; keyword?: string }) {
    return this.svc.listUsers(q);
  }

  @Post('users')
  @Perm('system:user')
  @OpLog('创建用户')
  createUser(@Body() dto: CreateUserDto) {
    return this.svc.createUser(dto);
  }

  @Put('users/:id')
  @Perm('system:user')
  @OpLog('更新用户')
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.svc.updateUser(id, dto);
  }

  @Post('users/:id/reset-password')
  @Perm('system:user')
  @OpLog('重置用户密码')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: { password: string }) {
    return this.svc.resetPassword(id, dto.password);
  }

  // ===== 角色权限 =====
  @Get('roles')
  roles() {
    return this.svc.listRoles();
  }

  @Get('perms-catalog')
  permsCatalog() {
    return this.svc.permsCatalog();
  }

  @Post('roles')
  @Perm('system:role')
  @OpLog('创建角色')
  createRole(@Body() dto: RoleDto) {
    return this.svc.createRole(dto);
  }

  @Put('roles/:id')
  @Perm('system:role')
  @OpLog('更新角色')
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: { name?: string; permissions?: string[]; remark?: string }) {
    return this.svc.updateRole(id, dto);
  }

  // ===== 操作日志 =====
  @Get('operation-logs')
  @Perm('system:log')
  logs(@Query() q: { page?: number; pageSize?: number; username?: string; keyword?: string; from?: string; to?: string }) {
    return this.svc.listLogs(q);
  }

  // ===== 账套 =====
  @Get('tenants/my')
  myTenants(@CurrentUser() user: SessionUser) {
    return this.svc.listMyTenants(user.uid, user.isSuper);
  }

  /** 健康检查:ping 关键端点(无需登录,用于系统状态探测) */
  @Public()
  @Get('health')
  async health() {
    const t0 = Date.now()
    // 探活:尝试一次数据库查询
    let dbOk = false
    let dbMs = 0
    try {
      const t1 = Date.now()
      // 用任意轻量查询探活
      await this.prisma.tenant.count({ where: { status: 1 } })
      dbMs = Date.now() - t1
      dbOk = true
    } catch (e) {
      dbOk = false
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      ts: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      db: { ok: dbOk, ms: dbMs },
      totalMs: Date.now() - t0,
      version: '1.0.0',
    }
  }

  /** 当前账套参数(总经理审批阈值、默认税率等) */
  @Get('tenants/current/params')
  @Perm('md:manage', 'system:user')
  currentParams(@CurrentTid() tenantId: number) {
    return this.svc.getTenantParams(tenantId);
  }

  @Put('tenants/current/params')
  @Perm('system:user')
  @OpLog('更新系统参数')
  updateParams(@CurrentTid() tenantId: number, @Body() dto: { gmExpenseThreshold?: number; defaultTaxRate?: number }) {
    return this.svc.updateTenantParams(tenantId, dto);
  }

  /** 当前账套的完整信息(企业抬头/税号/地址/法人/启用期间) */
  @Get('tenants/current')
  @Perm('md:manage', 'voucher:create', 'voucher:audit', 'ledger:view')
  currentTenant(@CurrentTid() tenantId: number) {
    return this.svc.getTenantInfo(tenantId);
  }

  /** 更新当前账套的企业信息(非超管只能改自己有权限的账套) */
  @Put('tenants/current')
  @Perm('md:manage', 'voucher:create', 'voucher:audit', 'ledger:view', 'system:user')
  @OpLog('更新当前账套企业信息')
  updateCurrent(
    @CurrentTid() tenantId: number,
    @CurrentUser() user: SessionUser,
    @Body() dto: { name?: string; taxNo?: string; address?: string; legalRep?: string; startYear?: number; startMonth?: number },
  ) {
    return this.svc.updateTenant(user.uid, user.isSuper, tenantId, dto);
  }

  @Get('tenants')
  @Perm('system:user')
  allTenants() {
    return this.svc.allTenants();
  }

  @Post('tenants')
  @Perm('system:user')
  @OpLog('创建账套')
  async createTenant(@CurrentUser() user: SessionUser, @Body() dto: TenantDto) {
    return this.svc.createTenant(dto, user.isSuper ? user.uid : undefined);
  }

  @Put('tenants/:id')
  @Perm('system:user')
  @OpLog('更新账套信息')
  updateTenant(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; taxNo?: string; address?: string; legalRep?: string; startYear?: number; startMonth?: number; params?: object },
  ) {
    return this.svc.updateTenant(user.uid, user.isSuper, id, dto);
  }

  @Post('tenants/:id/activate')
  @Perm('ledger:init')
  @OpLog('启用账套')
  activateTenant(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.activateTenant(user.uid, user.isSuper, id);
  }

  @Post('tenants/:id/deactivate')
  @Perm('system:user')
  @OpLog('停用账套')
  deactivateTenant(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deactivateTenant(user.uid, user.isSuper, id);
  }

  @Delete('tenants/:id')
  @Perm('system:user')
  @OpLog('删除账套')
  removeTenant(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removeTenant(user.uid, user.isSuper, id);
  }

  // ===== 数据备份 =====
  @Get('backups')
  @Perm('system:backup')
  listBackups() {
    return this.svc.listBackups();
  }

  @Post('backups/run')
  @Perm('system:backup')
  @OpLog('执行数据备份')
  runBackup() {
    return this.svc.runBackup();
  }

  @Get('backups/:name/download')
  @Perm('system:backup')
  download(@Param('name') name: string, @Res({ passthrough: true }) res: Response) {
    const p = this.svc.backupPath(name);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    createReadStream(p).pipe(res);
  }
}
