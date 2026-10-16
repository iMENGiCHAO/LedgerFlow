/**
 * 工资核算(小企业准则,月度批次):
 * - 每月一个 PayrollBatch,行按员工记录 应发/代扣社保/个税/其他扣款/实发
 * - 计提:借 管理费用-工资(560204) 应发合计,贷 应付职工薪酬(2211)
 *   (按部门拆分销/管理/生产成本需行业口径,此处统一走 560204,摘要注明按人明细)
 * - 发放:借 应付职工薪酬(2211) 应发合计,
 *        贷 银行存款(100201) 实发合计,贷 其他应付款(2241) 社保+个税(代扣未缴暂挂)
 * - 计提/发放凭证复用 voucherService(借贷平衡/期间锁/编号/审计全走既有链路)
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { VoucherService } from '../ledger/voucher.service';
import { periodSeq } from '../ledger/balance.service';

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface PayrollItemInput {
  employeeId: number;
  gross: number;
  socialIns?: number;
  tax?: number;
  otherDed?: number;
  remark?: string;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VoucherService,
  ) {}

  /** 查询/创建月度批次:items 缺省时按在册员工生成 0 值行便于录入 */
  async batch(tenantId: number, year: number, month: number, userId: number) {
    let b = await this.prisma.payrollBatch.findUnique({
      where: { tenantId_year_month: { tenantId, year, month } },
      include: { items: { orderBy: { id: 'asc' }, include: { employee: true } } },
    });
    if (!b) {
      const employees = await this.prisma.employee.findMany({
        where: { tenantId, status: 1 },
        orderBy: { code: 'asc' },
      });
      b = await this.prisma.payrollBatch.create({
        data: {
          tenantId,
          year,
          month,
          createdBy: userId,
          items: {
            create: employees.map((e) => ({
              tenantId,
              employeeId: e.id,
              gross: 0,
              socialIns: 0,
              tax: 0,
              otherDed: 0,
              net: 0,
            })),
          },
        },
        include: { items: { orderBy: { id: 'asc' }, include: { employee: true } } },
      });
    }
    return b;
  }

  /** 批量保存行(全量替换金额) */
  async saveItems(tenantId: number, batchId: number, items: PayrollItemInput[]) {
    const b = await this.prisma.payrollBatch.findFirst({ where: { id: batchId, tenantId } });
    if (!b) throw new BadRequestException('工资批次不存在');
    if (b.status !== 1) throw new BadRequestException('批次已计提,不能修改,如需调整请先红冲相关凭证');

    const valid = (items || []).filter((i) => Number(i.gross) >= 0);
    if (!valid.length) throw new BadRequestException('至少一行工资数据');
    // 租户隔离:员工必须属于本账套在册名单
    const ownEmployees = await this.prisma.employee.findMany({
      where: { tenantId, status: 1 },
      select: { id: true },
    });
    const ownIds = new Set(ownEmployees.map((e) => e.id));
    const foreign = valid.filter((i) => !ownIds.has(Number(i.employeeId)));
    if (foreign.length) throw new BadRequestException('存在非本账套在册员工的工资行,已拒绝');
    for (const it of valid) {
      const net = r2(Number(it.gross) - Number(it.socialIns || 0) - Number(it.tax || 0) - Number(it.otherDed || 0));
      if (net < 0) throw new BadRequestException('实发不能为负:请检查代扣金额');
      await this.prisma.payrollItem.upsert({
        where: { batchId_employeeId: { batchId, employeeId: Number(it.employeeId) } },
        create: {
          tenantId, batchId, employeeId: Number(it.employeeId),
          gross: r2(Number(it.gross)), socialIns: r2(Number(it.socialIns || 0)),
          tax: r2(Number(it.tax || 0)), otherDed: r2(Number(it.otherDed || 0)),
          net, remark: it.remark || null,
        },
        update: {
          gross: r2(Number(it.gross)), socialIns: r2(Number(it.socialIns || 0)),
          tax: r2(Number(it.tax || 0)), otherDed: r2(Number(it.otherDed || 0)),
          net, remark: it.remark || null,
        },
      });
    }
    return { ok: true };
  }

  /** 计提工资:生成凭证 借560204/贷2211 */
  async accrue(tenantId: number, batchId: number, userId: number) {
    const b = await this.prisma.payrollBatch.findFirst({
      where: { id: batchId, tenantId },
      include: { items: true },
    });
    if (!b) throw new BadRequestException('工资批次不存在');
    if (b.status !== 1) throw new BadRequestException('该月工资已计提');
    const totalGross = r2(b.items.reduce((s, i) => s + Number(i.gross), 0));
    if (totalGross <= 0) throw new BadRequestException('工资合计为零,请先录入工资数据');

    const [sSalary, sPayroll] = await Promise.all([
      this.requireSubject(tenantId, '560204'),
      this.requireSubject(tenantId, '2211'),
    ]);
    // 560204 启用部门辅助核算:按员工所属部门拆分借方行;无部门的员工要求先补档案
    const items = b.items.filter((i) => Number(i.gross) > 0);
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, id: { in: items.map((i) => i.employeeId) } },
      select: { id: true, deptId: true, name: true },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const noDept = items.filter((i) => !empMap.get(i.employeeId)?.deptId);
    if (noDept.length) {
      const names = noDept.map((i) => empMap.get(i.employeeId)?.name || i.employeeId).slice(0, 5).join('、');
      throw new BadRequestException(`员工 ${names} 等未分配部门,请先在员工档案中补全部门后再计提`);
    }
    const byDept = new Map<number, number>();
    for (const i of items) {
      const deptId = empMap.get(i.employeeId)!.deptId!;
      byDept.set(deptId, r2((byDept.get(deptId) ?? 0) + Number(i.gross)));
    }
    const deptIds = [...byDept.keys()];
    const depts = await this.prisma.department.findMany({
      where: { tenantId, id: { in: deptIds } },
      select: { id: true, name: true },
    });
    const deptName = new Map(depts.map((d) => [d.id, d.name]));

    const date = await this.batchDate(tenantId, b.year, b.month, 'accrue');
    const entries = [
      ...[...byDept.entries()].map(([deptId, amount]) => ({
        summary: `${b.year}-${b.month} 计提工资(${deptName.get(deptId) || '部门' + deptId})`,
        subjectId: sSalary.id,
        debit: amount,
        credit: 0,
        departmentId: deptId,
      })),
      { summary: `${b.year}-${b.month} 计提工资`, subjectId: sPayroll.id, debit: 0, credit: totalGross },
    ];
    const v = await this.vouchers.create(tenantId, userId, {
      date,
      word: '记',
      memo: `${b.year}-${b.month} 工资计提`,
      entries,
    }, { submit: true });

    const updated = await this.prisma.payrollBatch.update({
      where: { id: batchId },
      data: { status: 2, accrueVoucherId: v.id },
      include: { items: { orderBy: { id: 'asc' }, include: { employee: true } } },
    });
    return { batch: updated, voucher: { id: v.id, no: v.no } };
  }

  /** 发放工资:借2211/贷100201 实发,贷2241 代扣合计(未缴暂挂) */
  async pay(tenantId: number, batchId: number, userId: number) {
    const b = await this.prisma.payrollBatch.findFirst({
      where: { id: batchId, tenantId },
      include: { items: true },
    });
    if (!b) throw new BadRequestException('工资批次不存在');
    if (b.status !== 2) throw new BadRequestException('请先计提工资再发放');

    const totalGross = r2(b.items.reduce((s, i) => s + Number(i.gross), 0));
    const totalNet = r2(b.items.reduce((s, i) => s + Number(i.net), 0));
    const totalDed = r2(b.items.reduce((s, i) => s + Number(i.socialIns) + Number(i.tax) + Number(i.otherDed), 0));
    if (totalNet <= 0) throw new BadRequestException('实发合计为零,无法发放');

    const [sPayroll, sBank, sOther] = await Promise.all([
      this.requireSubject(tenantId, '2211'),
      this.requireSubject(tenantId, '100201'),
      totalDed > 0 ? this.requireSubject(tenantId, '2241') : Promise.resolve(null),
    ]);
    const date = await this.batchDate(tenantId, b.year, b.month, 'pay');
    const entries = [
      { summary: `${b.year}-${b.month} 发放工资`, subjectId: sPayroll.id, debit: totalGross, credit: 0 },
      { summary: `${b.year}-${b.month} 发放工资`, subjectId: sBank.id, debit: 0, credit: totalNet },
    ];
    if (totalDed > 0 && sOther) {
      entries.push({ summary: `${b.year}-${b.month} 代扣社保个税`, subjectId: sOther.id, debit: 0, credit: totalDed });
    }
    const v = await this.vouchers.create(tenantId, userId, {
      date, word: '记', memo: `${b.year}-${b.month} 工资发放`, entries,
    }, { submit: true });

    const updated = await this.prisma.payrollBatch.update({
      where: { id: batchId },
      data: { status: 3, payVoucherId: v.id },
      include: { items: { orderBy: { id: 'asc' }, include: { employee: true } } },
    });
    return { batch: updated, voucher: { id: v.id, no: v.no } };
  }

  /** 期间校验:批次所在月必须 ≤ 当前业务期间;记账日期取业务期间末日 */
  private async batchDate(tenantId: number, year: number, month: number, kind: 'accrue' | 'pay') {
    const period = await this.prisma.period.findFirst({
      where: { tenantId, year, month },
    });
    if (!period) throw new BadRequestException(`期间 ${year}-${month} 不存在`);
    if (period.status === 2) throw new BadRequestException(`期间 ${year}-${month} 已结账,不能${kind === 'accrue' ? '计提' : '发放'}工资`);
    const cur = await this.prisma.period.findFirst({
      where: { tenantId, status: 1 },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (!cur) throw new BadRequestException('无开启中的会计期间');
    if (periodSeq(year, month) < periodSeq(cur.year, cur.month)) {
      throw new BadRequestException(`工资期间 ${year}-${month} 早于当前业务期间 ${cur.year}-${cur.month},请调整批次月份`);
    }
    return `${year}-${String(month).padStart(2, '0')}-${kind === 'accrue' ? '28' : '28'}`;
  }

  private async requireSubject(tenantId: number, code: string) {
    const s = await this.prisma.subject.findFirst({ where: { tenantId, code } });
    if (!s || !s.isLeaf) throw new BadRequestException(`需要末级科目 ${code}(工资核算依赖),请先在科目设置中确认`);
    return s;
  }
}
