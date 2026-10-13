import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { BalanceService } from '../ledger/balance.service';

@Injectable()
export class MasterdataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balance: BalanceService,
  ) {}

  // ==================== 科目 ====================

  async subjectTree(tenantId: number) {
    const subjects = await this.balance.subjectsOf(tenantId);
    const nodes = subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      parentId: s.parentId,
      category: s.category,
      direction: s.direction,
      isLeaf: s.isLeaf,
      status: s.status,
      assist: s.assist,
      children: [] as unknown[],
    }));
    const byCode = new Map(nodes.map((n) => [n.code, n]));
    const roots: unknown[] = [];
    for (const n of nodes) {
      if (n.parentId) {
        const parent = nodes.find((x) => x.id === n.parentId);
        if (parent) {
          (parent.children as unknown[]).push(n);
          continue;
        }
      }
      roots.push(n);
    }
    void byCode;
    return { list: nodes, tree: roots };
  }

  /** 导出用:扁平科目列表,含父级编码 */
  async subjectListAll(tenantId: number) {
    const subs = await this.balance.subjectsOf(tenantId);
    const byId = new Map(subs.map((s) => [s.id, s]));
    return subs.map((s) => ({
      id: s.id, code: s.code, name: s.name, category: s.category,
      balanceDir: s.direction,
      auxType: s.assist
        ? (s.assist.partner ? 3 : s.assist.department ? 1 : s.assist.project ? 2 : 0)
        : 0,
      isLeaf: !subs.some((c) => c.parentId === s.id), status: s.status,
      parentCode: s.parentId ? (byId.get(s.parentId)?.code || '') : '',
    }));
  }

  async createSubject(
    tenantId: number,
    dto: {
      code: string;
      name: string;
      assist?: Record<string, boolean>;
      cashFlowType?: string;
      status?: number;
    },
  ) {
    const code = dto.code.trim();
    if (!/^\d{4}(\d{2}){0,4}$/.test(code)) throw new BadRequestException('科目编码必须为4位一级加每级2位数字');
    const exists = await this.prisma.subject.findFirst({ where: { tenantId, code } });
    if (exists) throw new BadRequestException(`科目 ${code} 已存在`);

    let parentId: number | null = null;
    let category = 1;
    let direction: 'D' | 'C' = 'D';
    let levelAssist = dto.assist ?? undefined;

    if (code.length > 4) {
      // 上级科目必须存在(逐级)
      for (let l = 4; l < code.length - 2; l += 2) {
        const prefix = code.slice(0, l);
        const parent = await this.prisma.subject.findFirst({ where: { tenantId, code: prefix } });
        if (!parent) throw new BadRequestException(`上级科目 ${prefix} 不存在`);
      }
      const directParent = await this.prisma.subject.findFirst({ where: { tenantId, code: code.slice(0, code.length - 2) } });
      if (!directParent) throw new BadRequestException('直接上级科目不存在');
      parentId = directParent.id;
      category = directParent.category;
      direction = directParent.direction === 'C' ? 'C' : 'D';
      if (!levelAssist) {
        const pa = (directParent.assist as Record<string, boolean> | null) ?? {};
        levelAssist = Object.keys(pa).length > 0 ? { ...pa } : undefined;
      }
    } else {
      const preset = (await import('../../constants/master-data')).PRESET_SUBJECTS.find((s) => s.code === code);
      if (!preset) throw new BadRequestException('一级科目必须是准则预置科目');
      category = preset.category;
      direction = preset.direction;
      levelAssist = dto.assist ?? preset.assist;
    }

    const subject = await this.prisma.$transaction(async (tx) => {
      if (parentId) {
        const children = await tx.subject.count({ where: { tenantId, parentId } });
        if (children > 0 || true) {
          await tx.subject.update({ where: { id: parentId }, data: { isLeaf: false } });
        }
      }
      return tx.subject.create({
        data: {
          tenantId,
          code,
          name: dto.name.trim(),
          parentId,
          category,
          direction,
          isLeaf: true,
          assist: levelAssist ?? undefined,
          cashFlowType: dto.cashFlowType ?? undefined,
          status: dto.status ?? 1,
        },
      });
    });
    return subject;
  }

  async updateSubject(
    tenantId: number,
    id: number,
    dto: { name?: string; status?: number; assist?: Record<string, boolean>; cashFlowType?: string },
  ) {
    const s = await this.prisma.subject.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('科目不存在');
    if (dto.status === 0) {
      const hasChildren = await this.prisma.subject.count({ where: { tenantId, parentId: id } });
      if (hasChildren > 0) throw new BadRequestException('存在下级科目,不可停用');
      // 有发生额也允许停用(只要没下级),但不能再录新凭证使用此科目
    }
    return this.prisma.subject.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        status: dto.status ?? undefined,
        assist: dto.assist ?? undefined,
        cashFlowType: dto.cashFlowType ?? undefined,
      },
    });
  }

  // ==================== 往来单位 ====================

  async partners(
    tenantId: number,
    q: { page?: number; pageSize?: number; type?: number; keyword?: string },
  ) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(q.type ? { type: q.type } : {}),
      ...(q.keyword ? { OR: [{ code: { contains: q.keyword } }, { name: { contains: q.keyword } }] } : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize ?? 50));
    const [total, list] = await Promise.all([
      this.prisma.partner.count({ where }),
      this.prisma.partner.findMany({ where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, list };
  }

  /** 导出:无分页 */
  async partnersAll(tenantId: number, q: { type?: number; keyword?: string }) {
    return this.prisma.partner.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(q.type ? { type: q.type } : {}),
        ...(q.keyword ? { OR: [{ code: { contains: q.keyword } }, { name: { contains: q.keyword } }] } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async savePartner(
    tenantId: number,
    dto: {
      id?: number;
      code: string;
      name: string;
      type: number;
      taxNo?: string;
      bankName?: string;
      bankAccount?: string;
      contact?: string;
      phone?: string;
      creditDays?: number;
      creditLimit?: number;
      status?: number;
    },
  ) {
    if (dto.id) {
      const found = await this.prisma.partner.findFirst({ where: { id: dto.id, tenantId } });
      if (!found) throw new NotFoundException('往来单位不存在');
      return this.prisma.partner.update({
        where: { id: dto.id },
        data: {
          name: dto.name,
          type: dto.type,
          taxNo: dto.taxNo,
          bankName: dto.bankName,
          bankAccount: dto.bankAccount,
          contact: dto.contact,
          phone: dto.phone,
          creditDays: dto.creditDays,
          creditLimit: dto.creditLimit !== undefined ? dto.creditLimit : undefined,
          status: dto.status,
        },
      });
    }
    const dup = await this.prisma.partner.findFirst({ where: { tenantId, code: dto.code } });
    if (dup) throw new BadRequestException(`编码 ${dto.code} 已存在`);
    return this.prisma.partner.create({ data: { tenantId, ...dto, creditLimit: dto.creditLimit } });
  }

  removePartner(tenantId: number, id: number) {
    return this.prisma.partner.updateMany({ where: { id, tenantId }, data: { deletedAt: new Date(), status: 0 } });
  }

  // ==================== 部门/项目/员工 ====================

  departments(tenantId: number) {
    return this.prisma.department.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  /** 导出:扁平列表 */
  async departmentsAll(tenantId: number) {
    return this.prisma.department.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async saveDepartment(tenantId: number, dto: { id?: number; code: string; name: string; status?: number }) {
    if (dto.id) {
      // 越权防御:必须先确认部门属于当前租户
      const found = await this.prisma.department.findFirst({ where: { id: dto.id, tenantId } });
      if (!found) throw new NotFoundException('部门不存在');
      return this.prisma.department.update({ where: { id: dto.id }, data: { name: dto.name, status: dto.status } });
    }
    const dup = await this.prisma.department.findFirst({ where: { tenantId, code: dto.code } });
    if (dup) throw new BadRequestException(`部门编码 ${dto.code} 已存在`);
    return this.prisma.department.create({ data: { tenantId, code: dto.code, name: dto.name, status: dto.status ?? 1 } });
  }

  projects(tenantId: number) {
    return this.prisma.project.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  /** 导出 */
  projectsAll(tenantId: number) {
    return this.prisma.project.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async saveProject(tenantId: number, dto: { id?: number; code: string; name: string; status?: number }) {
    if (dto.id) {
      const found = await this.prisma.project.findFirst({ where: { id: dto.id, tenantId } });
      if (!found) throw new NotFoundException('项目不存在');
      return this.prisma.project.update({ where: { id: dto.id }, data: { name: dto.name, status: dto.status } });
    }
    const dup = await this.prisma.project.findFirst({ where: { tenantId, code: dto.code } });
    if (dup) throw new BadRequestException(`项目编码 ${dto.code} 已存在`);
    return this.prisma.project.create({ data: { tenantId, code: dto.code, name: dto.name, status: dto.status ?? 1 } });
  }

  employees(tenantId: number) {
    return this.prisma.employee.findMany({ where: { tenantId }, orderBy: { code: 'asc' }, include: { dept: { select: { name: true } } } });
  }

  /** 导出 */
  employeesAll(tenantId: number) {
    return this.prisma.employee.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
      include: { dept: { select: { name: true } } },
    }).then((rows) => rows.map((e) => ({ ...e, deptName: e.dept?.name || '' })));
  }

  async saveEmployee(tenantId: number, dto: { id?: number; code: string; name: string; deptId?: number; position?: string; phone?: string; status?: number }) {
    if (dto.id) {
      const found = await this.prisma.employee.findFirst({ where: { id: dto.id, tenantId } });
      if (!found) throw new NotFoundException('员工不存在');
      return this.prisma.employee.update({
        where: { id: dto.id },
        data: { name: dto.name, deptId: dto.deptId, position: dto.position, phone: dto.phone, status: dto.status },
      });
    }
    const dup = await this.prisma.employee.findFirst({ where: { tenantId, code: dto.code } });
    if (dup) throw new BadRequestException(`员工编码 ${dto.code} 已存在`);
    return this.prisma.employee.create({
      data: { tenantId, code: dto.code, name: dto.name, deptId: dto.deptId, position: dto.position, phone: dto.phone, status: dto.status ?? 1 },
    });
  }

  // ==================== 常用摘要 ====================

  summaries(tenantId: number) {
    return this.prisma.summaryLib.findMany({ where: { tenantId }, orderBy: [{ usageCount: 'desc' }], take: 30 });
  }

  async addSummary(tenantId: number, text: string) {
    const found = await this.prisma.summaryLib.findFirst({ where: { tenantId, text } });
    if (found) {
      return this.prisma.summaryLib.update({ where: { id: found.id }, data: { usageCount: { increment: 1 } } });
    }
    return this.prisma.summaryLib.create({ data: { tenantId, text, usageCount: 1 } });
  }
}
