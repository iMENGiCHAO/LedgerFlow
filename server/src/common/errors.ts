import { HttpException } from '@nestjs/common';

/** 业务异常:携带业务错误码,统一由全局过滤器输出 */
export class BizException extends HttpException {
  constructor(
    public readonly bizCode: number,
    message: string,
    httpStatus = 400,
  ) {
    super({ code: bizCode, message, data: null }, httpStatus);
  }
}

export const ERR = {
  PARAM: 40001,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  CONFLICT: 40900,

  VOUCHER_UNBALANCED: 42001,
  VOUCHER_STATUS: 42002,
  PERIOD_LOCKED: 42003,
  TRIAL_UNBALANCED: 42004,
  SUBJECT_INVALID: 42005,
  ASSIST_MISSING: 42006,
  DOWNSTREAM_REF: 42007,
  CLOSING_CHECK_FAILED: 42008,
  UNCLOSING_FORBIDDEN: 42009,
  WRITEOFF_INVALID: 42010,
  CLAIM_FLOW_ERROR: 42011,
  DEP_DUPLICATED: 42012,
} as const;
