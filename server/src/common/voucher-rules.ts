/**
 * 凭证分录规则(纯函数,与 voucher.service.validateAndNormalize 同源)
 * 仅覆盖与数据库无关的会计规则:行数/金额/方向互斥/非负/借贷平衡/合计为正。
 * 科目存在性、末级、辅助核算等依赖 DB 的校验保留在 service。
 */

export interface RuleEntry {
  debit: number;
  credit: number;
}

export interface ValidateRulesOptions {
  /** 红冲凭证:允许负数金额与负合计 */
  isRed?: boolean;
  /** 金额容差(默认 0.0001,与 service 一致) */
  epsilon?: number;
}

export type RuleResult = { ok: true } | { ok: false; error: string };

/** 行级 + 整体借贷平衡校验;错误消息与 service 保持一致 */
export function validateEntryRules(entries: RuleEntry[] | undefined, opts: ValidateRulesOptions = {}): RuleResult {
  const eps = opts.epsilon ?? 0.0001;
  const list = entries || [];
  if (!Array.isArray(list) || list.length < 2) {
    return { ok: false, error: '凭证至少需要两行分录' };
  }

  let sumD = 0;
  let sumC = 0;
  for (let idx = 0; idx < list.length; idx++) {
    const d = Number(list[idx].debit);
    const c = Number(list[idx].credit);
    if (!Number.isFinite(d) || !Number.isFinite(c)) {
      return { ok: false, error: `第${idx + 1}行金额格式错误` };
    }
    const dOn = Math.abs(d) > eps;
    const cOn = Math.abs(c) > eps;
    if (dOn && cOn) return { ok: false, error: `第${idx + 1}行借贷方向互斥` };
    if (!dOn && !cOn) return { ok: false, error: `第${idx + 1}行金额不能为零` };
    if ((d < 0 || c < 0) && !opts.isRed) {
      return { ok: false, error: '普通凭证不允许负数金额(红冲请使用红冲功能)' };
    }
    sumD += d;
    sumC += c;
  }

  if (Math.abs(sumD - sumC) > eps) {
    return { ok: false, error: `借贷不平衡:借方合计 ${sumD.toFixed(2)} ≠ 贷方合计 ${sumC.toFixed(2)}` };
  }
  if (!opts.isRed && Math.abs(sumD) < eps) {
    return { ok: false, error: '凭证合计金额必须大于零' };
  }
  return { ok: true };
}
