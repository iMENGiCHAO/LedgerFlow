// 业务时钟:多账套系统中,"今天"应以账套当前业务期间为准,而非系统墙钟。
// 演示/教学账套常冻结在历史期间,若用 Date.now() 做报销时效、默认凭证日期,
// 会导致单据因"超 180 天"被拒、或默认日期落在已结账期间而触发期间锁。
// 本工具统一该口径:取最早未结账期间末日;无未结账期间时回退系统时间。

import { PrismaService } from '../prisma.service';

/**
 * 账套业务口径的"今天"。
 * 期间语义:Period.status = 2 已结账 / 1 未结账(含未来期间,故可能多期同时为 1),
 * 因此必须按 年度+月份 升序取"最早未结账期间",不能依赖 findFirst 的物理顺序。
 */
export async function getBusinessToday(prisma: PrismaService, tenantId: number): Promise<Date> {
  const period = await prisma.period
    .findFirst({
      where: { tenantId, status: 1 },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
      select: { year: true, month: true },
    })
    .catch(() => null)

  if (period && period.year && period.month) {
    // 该月最后一天:Date.UTC 的 day=0 表示上月末日(month 为 1-based 索引:3 → 2 月末);
    // 取正午 12:00 UTC,避免时区换算把日期推到相邻月份
    return new Date(Date.UTC(period.year, period.month, 0, 12, 0, 0))
  }
  return new Date()
}

/** 业务日期字符串 YYYY-MM-DD */
export function toBizDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}