import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PRESET_SUBJECTS } from '../../constants/master-data';
import { REPORT_PRESETS } from '../../constants/report-formulas';

/** 账套初始化:期间生成、预置科目、报表公式(全局一次) */
@Injectable()
export class TenantSetupService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** 应用启动时补齐全局报表公式配置 */
  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.prisma.reportFormula.findMany({ select: { reportCode: true, rowKey: true } });
      const have = new Set(existing.map((r) => `${r.reportCode}:${r.rowKey}`));
      const data = REPORT_PRESETS.flatMap(({ reportCode, rows }) =>
        rows
          .filter((r) => !have.has(`${reportCode}:${r.rowKey}`))
          .map((r) => ({
            reportCode,
            rowKey: r.rowKey,
            rowName: r.rowName,
            indent: r.indent ?? 0,
            bold: r.bold ?? false,
            expr: r.expr as object,
            sort: r.sort,
          })),
      );
      if (data.length > 0) await this.prisma.reportFormula.createMany({ data });
    } catch {
      // 数据库尚未就绪时忽略(seed 流程会再次触发)
    }
  }

  /** 生成年历期间(从启用年到当前年+1) */
  async ensurePeriods(tenantId: number, upToYear?: number): Promise<number> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const targetYear = Math.max(upToYear ?? new Date().getFullYear() + 1, new Date().getFullYear() + 1);
    let created = 0;
    for (let y = tenant.startYear; y <= targetYear; y++) {
      const rows = Array.from({ length: 12 }, (_, i) => ({
        tenantId,
        year: y,
        month: i + 1,
        status: y === tenant.startYear && i + 1 < tenant.startMonth ? 0 : 1,
      }));
      const r = await this.prisma.period.createMany({ data: rows, skipDuplicates: true });
      created += r.count;
    }
    return created;
  }

  /** 预置《小企业会计准则》科目表(仅补充缺失科目) */
  async seedSubjects(tenantId: number): Promise<number> {
    const existing = await this.prisma.subject.findMany({
      where: { tenantId },
      select: { code: true },
    });
    const have = new Set(existing.map((s) => s.code));
    const missing = PRESET_SUBJECTS.filter((s) => !have.has(s.code));
    if (missing.length === 0) return 0;
    await this.prisma.subject.createMany({
      data: missing.map((s) => ({
        tenantId,
        code: s.code,
        name: s.name,
        category: s.category,
        direction: s.direction,
        isLeaf: true,
        assist: s.assist ? s.assist : undefined,
        cashFlowType: s.cashFlowType ?? undefined,
        status: 1,
      })),
    });
    return missing.length;
  }
}
