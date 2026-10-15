import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { VoucherService } from '../ledger/voucher.service';
import { DashboardService } from './dashboard.service';
import { getBusinessToday, toBizDateStr } from '../../common/business-time';

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 报销费用类型 → 默认入账科目 */
export const EXPENSE_TYPE_SUBJECTS: Record<string, string> = {
  差旅费: '560202',
  交通费: '560202',
  办公费: '560201',
  业务招待费: '560203',
  通讯费: '560201',
  培训费: '560201',
  其他: '560201',
};

@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VoucherService,
  ) {}

  private async nextClaimNo(tenantId: number): Promise<string> {
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const prefix = `BX-${ym}-`;
    const agg = await this.prisma.expenseClaim.aggregate({
      where: { tenantId, claimNo: { startsWith: prefix } },
      _max: { claimNo: true },
    });
    const seq = agg._max.claimNo ? Number(agg._max.claimNo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async list(
    tenantId: number,
    viewer: { uid: number; isSuper: boolean; perms: string[] },
    q: { page?: number; pageSize?: number; status?: number; scope?: string; keyword?: string },
  ) {
    const canViewAll = viewer.isSuper || viewer.perms.includes('expense:approve') || viewer.perms.includes('expense:pay');
    const where = {
      tenantId,
      ...(q.status !== undefined && q.status !== null && `${q.status}` !== '' ? { status: Number(q.status) } : {}),
      ...(q.keyword ? { title: { contains: q.keyword } } : {}),
      ...(!canViewAll || q.scope === 'mine' ? { applicantId: viewer.uid } : {}),
      ...(q.scope === 'todo' ? { status: { in: [1, 2, 3, 4] }, NOT: { applicantId: viewer.uid } } : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const [total, list] = await Promise.all([
      this.prisma.expenseClaim.count({ where }),
      this.prisma.expenseClaim.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          applicant: { select: { realName: true } },
          dept: { select: { name: true } },
          items: true,
        },
      }),
    ]);
    // 兜底:老数据 currentNode=null 时按 status 自动推断
    const statusPhaseMap: Record<number, string> = {
      0: '草稿待提交',
      1: '待总经理审批',
      2: '待财务复核',
      3: '待财务复核(兼容)',
      4: '待付款',
      5: '流程已完结',
      6: '已驳回',
      7: '已撤回(申请人)',
    };
    for (const c of list as any[]) {
      if (!c.currentNode) c.currentNode = statusPhaseMap[c.status] || '-'
    }
    return { total, page, pageSize, list };
  }

  /** 导出:不分页,带 items */
  async listAll(
    tenantId: number,
    viewer: { uid: number; isSuper: boolean; perms: string[] },
    q: { status?: number; scope?: string; keyword?: string },
  ) {
    const canViewAll = viewer.isSuper || viewer.perms.includes('expense:approve') || viewer.perms.includes('expense:pay');
    const where = {
      tenantId,
      ...(q.status !== undefined && q.status !== null && `${q.status}` !== '' ? { status: Number(q.status) } : {}),
      ...(q.keyword ? { title: { contains: q.keyword } } : {}),
      ...(!canViewAll || q.scope === 'mine' ? { applicantId: viewer.uid } : {}),
      ...(q.scope === 'todo' ? { status: { in: [1, 2, 4] }, NOT: { applicantId: viewer.uid } } : {}),
    };
    const list = await this.prisma.expenseClaim.findMany({
      where,
      orderBy: [{ id: 'asc' }],
      include: {
        applicant: { select: { realName: true } },
        dept: { select: { name: true } },
      },
    });
    return list.map((c) => ({
      ...c,
      deptName: c.dept?.name || '',
      creator: c.applicant,
    }));
  }

  async create(
    tenantId: number,
    userId: number,
    dto: { title: string; deptId?: number; projectId?: number; items: { expenseType: string; occurDate: string; amount: number; invoiceCount: number; invoiceTotal?: number; remark?: string }[] },
  ) {
    if (!dto.items?.length) throw new BadRequestException('报销单至少一条明细');
    const total = r2(dto.items.reduce((a, i) => a + Number(i.amount || 0), 0));
    if (!(total > 0)) throw new BadRequestException('报销金额必须大于零');
    // 业务规则:申请人必须已分配部门(否则财务不知道该报给谁)
    let autoDeptId = dto.deptId ?? null
    if (autoDeptId == null) {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { deptId: true } })
      autoDeptId = u?.deptId ?? null
    }
    if (autoDeptId == null) {
      throw new BadRequestException('您还未分配所属部门,请联系管理员在「系统管理 → 用户管理」绑定部门后再提交报销')
    }
    // 业务规则 R17 票据必传 + 票面金额校验
    for (const [idx, it] of dto.items.entries()) {
      if (it.invoiceCount == null || Number(it.invoiceCount) < 1) {
        throw new BadRequestException(`第 ${idx + 1} 行「${it.expenseType}」必须填写票据张数(≥1),财务需要核验发票原件`);
      }
      // 票面金额合计必须 ≥ 报销金额(实际报销可以小于等于票面合计,不允许大于)
      const ticketTotal = Number(it.invoiceTotal ?? 0)
      if (ticketTotal > 0 && Number(it.amount) > ticketTotal + 0.01) {
        throw new BadRequestException(
          `第 ${idx + 1} 行报销金额 ¥${Number(it.amount).toFixed(2)} 超过票面合计 ¥${ticketTotal.toFixed(2)},请核对`
        )
      }
      if (it.occurDate) {
        const occ = new Date(it.occurDate)
        // 业务时钟:以账套当前期间为"今天"(演示账套冻结在历史期间时,报销时效仍按账套口径校验)
        const today = await getBusinessToday(this.prisma, tenantId)
        const days = (today.getTime() - occ.getTime()) / 86400000
        if (days > 180) {
          throw new BadRequestException(
            `第 ${idx + 1} 行发生日期 ${it.occurDate} 已超过 180 天,远超财务报销时效(通常 90 天内),请确认`
          )
        }
        if (days < 0) {
          throw new BadRequestException(`第 ${idx + 1} 行发生日期晚于今天,请核对`)
        }
      }
    }
    const claimNo = await this.nextClaimNo(tenantId);
    return this.prisma.expenseClaim.create({
      data: {
        tenantId,
        claimNo,
        applicantId: userId,
        deptId: autoDeptId,
        projectId: dto.projectId ?? null,
        title: dto.title,
        total,
        status: 0,
        createdBy: userId,
        items: {
          create: dto.items.map((i) => ({
            expenseType: i.expenseType,
            occurDate: new Date(i.occurDate),
            amount: r2(Number(i.amount)),
            invoiceCount: Number(i.invoiceCount),
            invoiceTotal: i.invoiceTotal != null ? r2(Number(i.invoiceTotal)) : null,
            remark: i.remark,
          })),
        },
      },
      include: { items: true },
    });
  }

  /**
   * 编辑报销单:仅申请人本人 + status∈{0草稿, 6已驳回, 7已撤回}
   * 这是驳回后再修改的关键能力(原来 status=6 死路,现在支持重提)
   */
  async update(tenantId: number, userId: number, id: number, dto: { title?: string; items?: { expenseType: string; occurDate: string; amount: number; invoiceCount: number; invoiceTotal?: number; remark?: string }[] }) {
    const c = await this.getClaim(tenantId, id);
    if (c.applicantId !== userId) throw new BadRequestException('只能修改本人的报销单');
    if (![0, 6, 7].includes(c.status)) {
      throw new BadRequestException(`当前状态不可修改,只能修改「草稿/已驳回/已撤回」单据`);
    }
    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.items) {
      if (!dto.items.length) throw new BadRequestException('报销单至少一条明细');
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i];
        if (!it.expenseType) throw new BadRequestException(`第 ${i + 1} 行费用类型必填`);
        if (!it.invoiceCount || it.invoiceCount < 1) {
          throw new BadRequestException(`第 ${i + 1} 行「${it.expenseType}」必须填写票据张数(≥1)`);
        }
        if (it.invoiceTotal != null && Number(it.amount) > Number(it.invoiceTotal) + 0.01) {
          throw new BadRequestException(`第 ${i + 1} 行报销金额 ¥${Number(it.amount).toFixed(2)} 超过票面合计 ¥${Number(it.invoiceTotal).toFixed(2)}`);
        }
        const d = new Date(it.occurDate);
        if (Number.isNaN(d.getTime())) throw new BadRequestException(`第 ${i + 1} 行发生日期无效`);
        // 业务时钟:与提交口径一致,按账套当前期间校验时效
        const bizToday = await getBusinessToday(this.prisma, tenantId);
        const days = (bizToday.getTime() - d.getTime()) / 86400000;
        if (days > 180) throw new BadRequestException(`第 ${i + 1} 行发生日期已超过 180 天,远超财务报销时效`);
      }
      patch.total = r2(dto.items.reduce((a, i) => a + Number(i.amount || 0), 0));
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.expenseClaimItem.deleteMany({ where: { claimId: id } });
        await tx.expenseClaimItem.createMany({
          data: dto.items.map((it) => ({
            claimId: id,
            expenseType: it.expenseType,
            occurDate: new Date(it.occurDate),
            amount: r2(Number(it.amount)),
            invoiceCount: Number(it.invoiceCount),
            invoiceTotal: it.invoiceTotal != null ? r2(Number(it.invoiceTotal)) : null,
            remark: it.remark,
          })),
        });
      }
      // 编辑后回到草稿,清驳回原因(让提交时重新走流程)
      return tx.expenseClaim.update({
        where: { id },
        data: { ...patch, status: 0, currentNode: '草稿(已修改)', rejectReason: null },
        include: { items: true },
      });
    });
  }

  private async getClaim(tenantId: number, id: number) {
    const c = await this.prisma.expenseClaim.findFirst({ where: { id, tenantId }, include: { items: true } });
    if (!c) throw new BadRequestException('报销单不存在');
    return c;
  }

  private record(claimId: number, approverId: number, approverName: string, action: string, opinion?: string) {
    return this.prisma.approvalRecord.create({
      data: { claimId, approverId, approverName, action, opinion },
    });
  }

  async submit(tenantId: number, userId: number, id: number) {
    const c = await this.getClaim(tenantId, id);
    // 业务规则:仅申请人本人可提交
    if (c.applicantId !== userId) throw new BadRequestException('只能提交本人的报销单');
    // 业务规则:草稿/已驳回/已撤回都可重新提交(驳回后修改再提)
    if (![0, 6, 7].includes(c.status)) {
      throw new BadRequestException(`当前状态(${c.status})不可提交,只能提交「草稿/已驳回/已撤回」单据`);
    }
    // 业务规则 R16 金额分级(无部门经理,简化为三档):
    //   - 金额 > 10000(强制)或 > 5000(默认阈值)→ status=1 待总经理审批 → 2 待财务复核
    //   - 金额 ≤ 阈值 → status=2 跳过总经理直接待财务复核
    //   - 任何金额都必须走 财务复核(2) → 待付款(4) → 已付款(5)
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const params = (tenant.params as { gmExpenseThreshold?: number }) ?? {};
    const threshold = params.gmExpenseThreshold ?? 5000;
    const total = Number(c.total);
    const needBoss = total >= threshold;
    const nextStatus = needBoss ? 1 : 2;  // 1=待总经理审批 / 2=待财务复核
    const nextNode = needBoss ? '待总经理审批' : '待财务复核';
    const submitNote = needBoss
      ? `¥${total.toFixed(2)} 超过 ¥${threshold} 阈值,需总经理审批`
      : `¥${total.toFixed(2)} 在 ¥${threshold} 阈值内,直接进入财务复核`;
    await this.prisma.expenseClaim.update({ where: { id: c.id }, data: { status: nextStatus, currentNode: nextNode, rejectReason: null } });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { realName: true } });
    await this.record(c.id, userId, user.realName, 'submit', submitNote);
    DashboardService.invalidate(tenantId);
    return { ok: true, status: nextStatus, node: nextNode, needBoss, note: submitNote };
  }

  /** 审批流转(无部门经理,简化版,按金额分级):
   * - 大额 submit → status=1 (待总经理审批)
   * - 小额 submit → status=2 (待财务复核)
   * - 总经理通过 1 → 2 (财务复核)
   * - 财务通过 2 → 4 (待付款)
   * - 出纳付款 4 → 5 (已付款)
   * 兼容老数据:status=3 也走同样路径(财务复核通过 → 4)
   * 6 驳回 / 7 撤回
   */
  async decide(tenantId: number, user: { uid: number; realName: string; isSuper: boolean; perms: string[] }, id: number, action: 'approve' | 'reject', opinion?: string) {
    const c = await this.getClaim(tenantId, id);
    if (![1, 2, 3].includes(c.status)) throw new BadRequestException('当前状态不可审批');
    if (action === 'reject') {
      const stageName = c.status === 1 ? '总经理审批' : c.status === 2 || c.status === 3 ? '财务复核' : c.status === 4 ? '出纳付款' : '审批';
      await this.prisma.expenseClaim.update({
        where: { id: c.id },
        data: { status: 6, currentNode: `已驳回 · ${stageName}`, rejectReason: opinion || '驳回' },
      });
      await this.record(c.id, user.uid, user.realName, 'reject', opinion);
      DashboardService.invalidate(tenantId);
      return { ok: true, status: 6, node: `已驳回 · ${stageName}` };
    }
    // 业务规则 R17 财务复核前再核一遍票据
    if (c.status === 2 || c.status === 3) {
      const items = await this.prisma.expenseClaimItem.findMany({ where: { claimId: c.id } })
      for (const it of items) {
        if (Number(it.invoiceCount) < 1) {
          throw new BadRequestException(`「${it.expenseType}」缺票据,财务不能放行,请补充`)
        }
      }
    }
    let nextStatus = c.status;
    let nextNode: string | null = null;
    if (c.status === 1) {
      nextStatus = 2;
      nextNode = '财务复核';
    } else if (c.status === 2) {
      nextStatus = 4;
      nextNode = '出纳付款';
    } else if (c.status === 3) {
      // 老数据兼容
      nextStatus = 4;
      nextNode = '出纳付款';
    }
    await this.prisma.expenseClaim.update({ where: { id: c.id }, data: { status: nextStatus, currentNode: nextNode } });
    await this.record(c.id, user.uid, user.realName, 'approve', opinion);
    DashboardService.invalidate(tenantId);
    return { ok: true, status: nextStatus, node: nextNode };
  }

  /** 出纳付款并自动生成凭证草稿(借费用科目/贷资金科目) */
  async pay(
    tenantId: number,
    user: { uid: number; realName: string },
    id: number,
    dto: { settleSubjectCode: string; settleType?: string; date?: string },
  ) {
    const c = await this.getClaim(tenantId, id);
    if (c.status !== 4) throw new BadRequestException('仅「待付款」状态的报销单可以付款');
    // 业务规则:付款前再核一次票据(防止审批后改数据)
    for (const it of c.items) {
      if (!it.invoiceCount || it.invoiceCount < 1) {
        throw new BadRequestException(`第 ${c.items.indexOf(it) + 1} 行「${it.expenseType}」必须填写票据张数(≥1)`);
      }
      if (it.invoiceTotal != null && Number(it.amount) > Number(it.invoiceTotal) + 0.01) {
        throw new BadRequestException(`第 ${c.items.indexOf(it) + 1} 行报销金额超过票面合计`);
      }
    }
    const subjects = await this.prisma.subject.findMany({ where: { tenantId } });

    // 部门为销售部时计入销售费用,否则管理费用
    let deptName = '';
    if (c.deptId) {
      const d = await this.prisma.department.findUnique({ where: { id: c.deptId } });
      deptName = d?.name ?? '';
    }
    const defaultCode = deptName.startsWith('销售') ? '560101' : '560201';
    const cashSubject = subjects.find((s) => s.code === dto.settleSubjectCode);
    if (!cashSubject) throw new BadRequestException('资金科目不存在');

    // 按费用类型汇总
    const byType = new Map<string, number>();
    for (const item of c.items) {
      const code = EXPENSE_TYPE_SUBJECTS[item.expenseType] ?? defaultCode;
      byType.set(code, r2((byType.get(code) ?? 0) + Number(item.amount)));
    }
    const entries: Parameters<VoucherService['create']>[2]['entries'] = [];
    for (const [code, amt] of byType.entries()) {
      const subj = subjects.find((s) => s.code === code);
      if (!subj) continue;
      entries.push({
        summary: `报销-${c.title}`,
        subjectId: subj.id,
        debit: amt,
        credit: 0,
        departmentId: c.deptId ?? null,
        projectId: c.projectId ?? null,
      });
    }
    entries.push({
      summary: `支付报销 ${c.claimNo}`,
      subjectId: cashSubject.id,
      debit: 0,
      credit: Number(c.total),
      settleType: dto.settleType || '转账',
      settleNo: c.claimNo,
    });

    const voucher = await this.vouchers.create(
      tenantId,
      user.uid,
      {
        word: '付',
        // 默认入账日期取账套当前期间(期间锁安全),显式传参则尊重调用方
        date: dto.date || toBizDateStr(await getBusinessToday(this.prisma, tenantId)),
        memo: `费用报销-${c.title}`.slice(0, 120),
        entries,
      },
      { submit: true, sourceType: 1, sourceId: c.id },
    );
    await this.prisma.$transaction([
      this.prisma.expenseClaim.update({
        where: { id: c.id },
        data: { status: 5, currentNode: '流程已完结', payVoucherId: voucher.id, paidAt: new Date() },
      }),
      this.record(c.id, user.uid, user.realName, 'pay', `已付款 ¥${Number(c.total).toFixed(2)} · 凭证#${voucher.id}`),
    ]);
    DashboardService.invalidate(tenantId);
    return { ok: true, voucherId: voucher.id };
  }

  async withdraw(tenantId: number, userId: number, id: number) {
    const c = await this.getClaim(tenantId, id);
    if (c.applicantId !== userId) throw new BadRequestException('只能撤回本人单据');
    if (c.status > 2) throw new BadRequestException('当前状态不可撤回');
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { realName: true } });
    await this.prisma.$transaction([
      this.prisma.expenseClaim.update({
        where: { id: c.id },
        data: { status: 7, currentNode: '已撤回(申请人)' },
      }),
      this.record(c.id, userId, u.realName, 'withdraw', '申请人主动撤回'),
    ]);
    DashboardService.invalidate(tenantId);
    return { ok: true };
  }

  detail(tenantId: number, id: number) {
    return this.prisma.expenseClaim.findFirst({
      where: { id, tenantId },
      include: {
        items: true,
        approvals: { orderBy: { createdAt: 'asc' } },
        applicant: { select: { realName: true, username: true } },
        dept: { select: { name: true } },
        project: { select: { name: true } },
        payVoucher: { select: { id: true, word: true, no: true, status: true } },
      },
    }).then((c: any) => {
      if (c && !c.currentNode) {
        const statusPhaseMap: Record<number, string> = {
          0: '草稿待提交', 1: '待总经理审批', 2: '待财务复核', 3: '待财务复核(兼容)',
          4: '待付款', 5: '流程已完结', 6: '已驳回', 7: '已撤回(申请人)',
        }
        c.currentNode = statusPhaseMap[c.status] || '-'
      }
      return c
    });
  }
}
