/**
 * 进程级轻量观测指标(单机够用):
 * - 请求计数/慢请求数(health 端点暴露)
 * - 访问日志结构化一行 JSON(NODE_ENV=production 时也保留,便于采集)
 */
export const metrics = {
  requestsTotal: 0,
  requestsSlow: 0,
  inFlight: 0,
  startedAt: new Date().toISOString(),
};

export interface AccessLogLine {
  t: string;
  m: string;
  p: string;
  s: number;
  ms: number;
  slow?: 1;
}
