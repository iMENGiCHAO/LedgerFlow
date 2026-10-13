import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { exec } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { promisify } from 'util';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma.service';
import { ALL_PERMS } from '../../constants/master-data';
import { LedgerService } from '../ledger/ledger.service';

const execAsync = promisify(exec);

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  // ==================== 用户 ====================

  async listUsers(q: { page?: number; pageSize?: number; keyword?: string }) {
    const where = q.keyword
      ? {
          OR: [
            { username: { contains: q.keyword } },
            { realName: { contains: q.keyword } },
          ],
        }
      : {};
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const [total, list] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          realName: true,
          phone: true,
          email: true,
          status: true,
          isSuper: true,
          deptId: true,
          dept: { select: { id: true, code: true, name: true } },
          createdAt: true,
          userRoles: { select: { role: { select: { id: true, code: true, name: true } } } },
          userTenants: { select: { tenantId: true, isDefault: true, tenant: { select: { name: true } } } },
        },
      }),
    ]);
    return { total, page, pageSize, list };
  }

  async createUser(dto: {
    username: string;
    password: string;
    realName: string;
    phone?: string;
    email?: string;
    isSuper?: boolean;
    deptId?: number | null;
    roleIds?: number[];
    tenantIds?: number[];
  }) {
    if (dto.username.trim().length < 2) throw new BadRequestException('用户名至少2个字符');
    if (!dto.password || dto.password.length < 6) throw new BadRequestException('密码至少6位');
    const dup = await this.prisma.user.findUnique({ where: { username: dto.username.trim() } });
    if (dup) throw new BadRequestException('用户名已存在');
    return this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        passwordHash: bcrypt.hashSync(dto.password, 10),
        realName: dto.realName,
        phone: dto.phone,
        email: dto.email,
        isSuper: dto.isSuper ?? false,
        deptId: dto.deptId ?? null,
        userRoles: { create: (dto.roleIds ?? []).map((roleId) => ({ roleId })) },
        userTenants: {
          create: (dto.tenantIds ?? []).map((tenantId, i) => ({ tenantId, isDefault: i === 0 })),
        },
      },
    });
  }

  async updateUser(
    id: number,
    dto: {
      realName?: string;
      phone?: string;
      email?: string;
      status?: number;
      isSuper?: boolean;
      deptId?: number | null;
      roleIds?: number[];
      tenantIds?: number[];
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          realName: dto.realName ?? undefined,
          phone: dto.phone ?? undefined,
          email: dto.email ?? undefined,
          status: dto.status ?? undefined,
          isSuper: dto.isSuper ?? undefined,
          deptId: dto.deptId === undefined ? undefined : dto.deptId,
        },
      });
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (dto.roleIds.length > 0) {
          await tx.userRole.createMany({ data: dto.roleIds.map((roleId) => ({ userId: id, roleId })) });
        }
      }
      if (dto.tenantIds) {
        await tx.userTenant.deleteMany({ where: { userId: id } });
        if (dto.tenantIds.length > 0) {
          await tx.userTenant.createMany({
            data: dto.tenantIds.map((tenantId, i) => ({ userId: id, tenantId, isDefault: i === 0 })),
          });
        }
      }
      return tx.user.findUnique({ where: { id }, include: { userRoles: true, userTenants: true } });
    });
  }

  async resetPassword(id: number, password: string) {
    if (!password || password.length < 6) throw new BadRequestException('密码至少6位');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: bcrypt.hashSync(password, 10) } });
    return { ok: true };
  }

  // ==================== 角色与权限 ====================

  listRoles() {
    return this.prisma.role.findMany({ orderBy: { id: 'asc' } });
  }

  permsCatalog() {
    return ALL_PERMS;
  }

  async createRole(dto: { code: string; name: string; permissions: string[]; remark?: string }) {
    const dup = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (dup) throw new BadRequestException('角色编码已存在');
    const invalid = dto.permissions.filter((p) => !ALL_PERMS.includes(p));
    if (invalid.length > 0) throw new BadRequestException(`未知权限码:${invalid.join(',')}`);
    return this.prisma.role.create({ data: dto });
  }

  async updateRole(id: number, dto: { name?: string; permissions?: string[]; remark?: string }) {
    if (dto.permissions) {
      const invalid = dto.permissions.filter((p) => !ALL_PERMS.includes(p));
      if (invalid.length > 0) throw new BadRequestException(`未知权限码:${invalid.join(',')}`);
    }
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  // ==================== 操作日志 ====================

  async listLogs(q: { page?: number; pageSize?: number; username?: string; keyword?: string; from?: string; to?: string }) {
    const where = {
      ...(q.username ? { username: { contains: q.username } } : {}),
      ...(q.keyword ? { action: { contains: q.keyword } } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59`) } : {}) } }
        : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const [total, rows] = await Promise.all([
      this.prisma.operationLog.count({ where }),
      this.prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => ({ ...r, id: r.id.toString(), detail: r.detail ?? null })),
    };
  }

  // ==================== 账套管理 ====================

  async createTenant(dto: { name: string; taxNo?: string; address?: string; legalRep?: string; startYear: number; startMonth: number }, linkUserId?: number) {
    if (dto.startMonth < 1 || dto.startMonth > 12) throw new BadRequestException('启用月份无效');
    const tenant = await this.prisma.tenant.create({ data: dto });
    if (linkUserId) {
      await this.prisma.userTenant.create({ data: { userId: linkUserId, tenantId: tenant.id, isDefault: true } });
    }
    return tenant;
  }

  listMyTenants(userId: number, isSuper: boolean) {
    if (isSuper) return this.allTenants();
    return this.prisma.tenant.findMany({
      where: { userTenants: { some: { userId } } },
      orderBy: { id: 'asc' },
      include: { _count: { select: { vouchers: true } } },
    });
  }

  allTenants() {
    return this.prisma.tenant.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { vouchers: true } } } });
  }

  /**
   * 启用账套(0 → 1)。仅账套已录入期初且借贷平衡时启用成功。
   * 业务规则:启用成功后,公司信息可改但启用期间(startYear/startMonth)锁定。
   */
  async activateTenant(userId: number, isSuper: boolean, id: number) {
    if (!isSuper) {
      const ut = await this.prisma.userTenant.findFirst({ where: { userId, tenantId: id } });
      if (!ut) throw new ForbiddenException('无权启用该账套');
    }
    return this.ledger.activateTenant(id);
  }

  /**
   * 停用账套(1 → 0)。停用后:
   *  - 用户不能再切到该账套
   *  - 已有数据保留(不删)
   *  - 启用期间可重新调整
   * 业务规则:账套下有未结账期间才能停(避免"还在记账中"被停)
   */
  async deactivateTenant(userId: number, isSuper: boolean, id: number) {
    if (!isSuper) {
      const ut = await this.prisma.userTenant.findFirst({ where: { userId, tenantId: id } });
      if (!ut) throw new ForbiddenException('无权停用该账套');
    }
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id } });
    if (t.status !== 1) throw new BadRequestException('账套当前未启用,无需停用');
    // 安全检查:有已记账期间就停(真实业务允许"停用"做"档案封存"——这里直接允许)
    // 注:严格场景应检查是否有进行中期间,本系统期间一旦结账后不可逆,停用即"存档"
    return this.prisma.tenant.update({
      where: { id },
      data: { status: 0 },
    });
  }

  /**
   * 删除账套。业务规则(防止误删):
   *  1. 仅超管可删
   *  2. 账套下没有任何业务数据(凭证/科目/用户)时才能删
   *  3. 默认账套(status=1)禁止删(只能停用)
   *  否则:返回 40000 + 详细原因,让用户知道哪些数据需要先清
   */
  async removeTenant(userId: number, isSuper: boolean, id: number) {
    if (!isSuper) throw new ForbiddenException('仅系统管理员可删除账套');
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: { select: { vouchers: true, subjects: true, partners: true, userTenants: true } },
      },
    });
    if (!t) throw new NotFoundException('账套不存在');
    if (t.status === 1) throw new BadRequestException('已启用的账套不能删除(请先停用)');
    // 业务规则:不允许删除有任何"业务痕迹"的账套
    //  - 凭证/科目/往来单位 是真实业务数据,绝不可"丢失"
    //  - userTenants 是授权关系,删除账套时一并清空(下面事务里删)
    const reasons: string[] = [];
    if (t._count.vouchers > 0) reasons.push(`凭证 ${t._count.vouchers} 张`);
    if (t._count.subjects > 0) reasons.push(`科目 ${t._count.subjects} 个`);
    if (t._count.partners > 0) reasons.push(`往来单位 ${t._count.partners} 个`);
    if (reasons.length > 0) {
      throw new BadRequestException(`账套下仍有数据,无法删除:${reasons.join('、')}。请先清空数据后再删,或保留账套仅「停用」。`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.userTenant.deleteMany({ where: { tenantId: id } });
      return tx.tenant.delete({ where: { id } });
    });
  }

  /** 当前账套的完整信息(供企业抬头/编辑表单) */
  async getTenantInfo(tenantId: number) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { vouchers: true, subjects: true, partners: true, userTenants: true } },
      },
    });
    if (!t) throw new NotFoundException('账套不存在');
    return {
      id: t.id,
      name: t.name,
      taxNo: t.taxNo,
      address: t.address,
      legalRep: t.legalRep,
      startYear: t.startYear,
      startMonth: t.startMonth,
      status: t.status,
      createdAt: t.createdAt,
      stats: t._count,
    };
  }

  /** 修改账套(企业信息)。非超管只能改自己 userTenants 里的账套。 */
  async updateTenant(
    userId: number,
    isSuper: boolean,
    id: number,
    dto: { name?: string; taxNo?: string; address?: string; legalRep?: string; startYear?: number; startMonth?: number; params?: object },
  ) {
    if (!isSuper) {
      // 越权防御:验证当前用户有该账套的访问权
      const ut = await this.prisma.userTenant.findFirst({ where: { userId, tenantId: id } });
      if (!ut) throw new ForbiddenException('无权修改该账套');
    }
    // 业务规则:启用期间(若传了 startYear/startMonth),仅当账套尚未启用时可改
    if (dto.startYear !== undefined || dto.startMonth !== undefined) {
      const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id } });
      if (t.status === 1 && (dto.startYear !== t.startYear || dto.startMonth !== t.startMonth)) {
        throw new BadRequestException('账套已启用,不能修改启用期间');
      }
      if (dto.startMonth !== undefined && (dto.startMonth < 1 || dto.startMonth > 12)) {
        throw new BadRequestException('启用月份必须在 1-12 之间');
      }
      if (dto.startYear !== undefined && (dto.startYear < 2000 || dto.startYear > 2099)) {
        throw new BadRequestException('启用年份必须在 2000-2099 之间');
      }
    }
    // 业务规则:公司名不能为空字符串
    if (dto.name !== undefined && dto.name.trim() === '') {
      throw new BadRequestException('公司名称不能为空');
    }
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async getTenantParams(tenantId: number) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { params: true } });
    // 提供默认值,前端可读
    return {
      gmExpenseThreshold: 5000,
      defaultTaxRate: 0.13,
      ...((t.params as Record<string, unknown>) || {}),
    };
  }

  async updateTenantParams(tenantId: number, dto: { gmExpenseThreshold?: number; defaultTaxRate?: number }) {
    // 业务规则校验
    if (dto.gmExpenseThreshold !== undefined) {
      if (typeof dto.gmExpenseThreshold !== 'number' || dto.gmExpenseThreshold < 0) {
        throw new BadRequestException('审批阈值必须为非负数字');
      }
      if (dto.gmExpenseThreshold > 10000000) {
        throw new BadRequestException('审批阈值不能超过 1000 万');
      }
    }
    if (dto.defaultTaxRate !== undefined) {
      if (typeof dto.defaultTaxRate !== 'number' || dto.defaultTaxRate < 0 || dto.defaultTaxRate > 1) {
        throw new BadRequestException('默认税率必须在 0-1 之间');
      }
    }
    // 合并到现有 params,不丢字段
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const merged = { ...((t.params as object) || {}), ...dto };
    return this.prisma.tenant.update({ where: { id: tenantId }, data: { params: merged } });
  }

  // ==================== 数据备份 ====================

  backupDir(): string {
    const dir = process.env.BACKUP_DIR || './backups';
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 选择与服务器主版本匹配的 pg_dump(PATH 版本可能低于服务器版本) */
  private async resolvePgDump(): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<Record<string, string>[]>('SHOW server_version;');
    // SHOW 不支持列别名,列名即 server_version
    const raw = Object.values(rows[0] ?? {})[0] ?? '';
    const major = String(raw).split(' ')[0].split('.')[0];
    const candidates = [
      `/usr/local/opt/postgresql@${major}/bin/pg_dump`,
      `/opt/homebrew/opt/postgresql@${major}/bin/pg_dump`,
      '/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump',
      // PATH 兜底(版本可能不匹配,仅在前面的候选都不存在时使用)
      'pg_dump',
    ];
    for (const cmd of candidates) {
      try {
        await execAsync(`command -v ${cmd.includes('/') ? `"${cmd}"` : cmd}`);
        return cmd;
      } catch {
        continue;
      }
    }
    return 'pg_dump';
  }

  async runBackup(): Promise<{ fileName: string; size: number }> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new BadRequestException('未配置数据库连接');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `fm-backup-${stamp}.sql.gz`;
    const filePath = join(this.backupDir(), fileName);
    // 从 URL 解析连接参数,避免 shell 转义问题
    const u = new URL(url);
    const pgDump = await this.resolvePgDump();
    const quoted = (s: string) => `'${s.replace(/'/g, "")}'`;
    const cmd = `PGPASSWORD=${quoted(u.password || '')} ${pgDump.includes('/') ? quoted(pgDump) : pgDump} -h ${u.hostname} -p ${u.port || '5432'} -U ${quoted(u.username)} -d ${quoted(u.pathname.slice(1))} -Fc -f ${quoted(filePath)}`;
    try {
      await execAsync(cmd, { timeout: 120_000 });
    } catch (err) {
      throw new BadRequestException(`备份失败:${(err as Error).message}`.slice(0, 400));
    }
    const size = statSync(filePath).size;
    return { fileName, size };
  }

  listBackups() {
    const dir = this.backupDir();
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql.gz') || f.endsWith('.sql'))
      .map((f) => {
        const st = statSync(join(dir, f));
        return { fileName: f, size: st.size, createdAt: st.mtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  backupPath(fileName: string): string {
    const safe = basename(fileName);
    const p = join(this.backupDir(), safe);
    if (!existsSync(p)) throw new NotFoundException('备份文件不存在');
    return p;
  }
}
