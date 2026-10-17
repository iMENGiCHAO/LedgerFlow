/**
 * LedgerFlow MCP Server — 让 AI 智能体(Claude / Cursor / 任意 Agent)通过
 * Model Context Protocol 直接查询账务、生成报表、录入凭证。
 *
 * 形态:stdio 传输,独立进程(不影响 Nest 主服务);
 * 鉴权:启动时用环境变量中的账套用户登录获取 JWT,401 自动重登;
 * 数据面:全部经 http 调用既有 REST API —— 与 Web 前端同权、同校验、同审计,
 *         借贷平衡 / 期间锁 / 辅助核算 / 制审分离等全部业务规则零重复、零旁路。
 *
 * 环境变量:
 *   MCP_API_BASE   — API 地址,默认 http://127.0.0.1:3100/api/v1
 *   MCP_USERNAME   — 登录账号(建议专用「AI 智能体」用户,授予会计权限)
 *   MCP_PASSWORD   — 登录密码
 *
 * 接入:Claude Desktop / Cursor / 任意 MCP 客户端按 docs/MCP-GUIDE.md 配置。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.MCP_API_BASE || 'http://127.0.0.1:3100/api/v1';
const MCP_USERNAME = process.env.MCP_USERNAME || '';
const MCP_PASSWORD = process.env.MCP_PASSWORD || '';

let token: string | null = null;

async function login(): Promise<string> {
  if (!MCP_USERNAME || !MCP_PASSWORD) {
    throw new Error('未配置 MCP_USERNAME / MCP_PASSWORD 环境变量,无法登录 LedgerFlow');
  }
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: MCP_USERNAME, password: MCP_PASSWORD }),
  });
  const body: any = await res.json().catch(() => ({}) as any);
  if (body?.code !== 0 || !body?.data?.accessToken) {
    throw new Error(`MCP 登录失败(${res.status}): ${body?.message || '账号或密码错误'}`);
  }
  return body.data.accessToken as string;
}

async function api(method: string, path: string, body?: unknown): Promise<any> {
  if (!token) token = await login();
  const call = async (t: string) =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  let res = await call(token);
  if (res.status === 401) {
    token = await login();
    res = await call(token);
  }
  const json: any = await res.json().catch(() => ({}) as any);
  if (json?.code !== 0) {
    throw new Error(`LedgerFlow API ${method} ${path} 失败:${json?.message || `HTTP ${res.status}`}`);
  }
  return json.data;
}

const fmt = (x: any) => (typeof x === 'number' ? x.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : x);

/** 把 API 结果整理成「人话摘要 + 结构化 JSON」,便于智能体理解与转述 */
function reply(summary: string, data?: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = data === undefined ? summary : `${summary}\n\n${JSON.stringify(data, null, 2)}`;
  return { content: [{ type: 'text' as const, text }] };
}

const money = z.number().describe('金额,单位元,保留两位小数');
const subjectCode = z.string().describe('末级科目编码,如 100201(工商银行基本户)、560204(管理费用-工资)');

async function buildServer(): Promise<McpServer> {
  const server = new McpServer({ name: 'ledgerflow', version: '1.0.0' });

  // ---------- 查询类 ----------

  server.tool(
    'list_periods',
    '查询账套的会计期间列表(年份、月份、已结账/进行中状态)',
    {},
    async () => {
      const data = await api('GET', '/periods');
      const list = data?.list || data || [];
      const lines = list.map((p: any) => `${p.year}-${String(p.month).padStart(2, '0')} ${p.status === 2 ? '已结账' : p.status === 1 ? '进行中' : '未开始'}`);
      return reply(`共 ${list.length} 个期间:\n${lines.join('\n')}`, data);
    },
  );

  server.tool(
    'get_dashboard',
    '获取经营看板:资金头寸、本月收入/利润、应收逾期、12 个月收支趋势、TOP 费用与待办',
    {},
    async () => {
      const data = await api('GET', '/dashboard/summary');
      return reply('经营看板数据如下。', data);
    },
  );

  server.tool(
    'get_balance_sheet',
    '获取资产负债表(资产=负债+权益,含平衡校验)。periodId 不传则取最近已开启期间',
    { periodId: z.number().optional().describe('会计期间 id(可先用 list_periods 查询)') },
    async ({ periodId }) => {
      const data = await api('GET', `/reports/balance-sheet${periodId ? `?periodId=${periodId}` : ''}`);
      const check = (data as any)?.balanceCheck;
      const rows = ((data as any)?.rows || []).filter((r: any) => r.periodValue);
      const brief = rows.map((r: any) => `${r.rowName}: ${fmt(r.periodValue)}`).join('\n');
      return reply(
        `资产负债表${check ? `(试算${check.balanced ? '平衡' : '不平衡!'})` : ''}:\n${brief || '该期间无数据'}`,
        data,
      );
    },
  );

  server.tool(
    'get_income_statement',
    '获取利润表(本期金额与本年累计,口径已剔除结转损益凭证)',
    { periodId: z.number().optional().describe('会计期间 id') },
    async ({ periodId }) => {
      const data = await api('GET', `/reports/income${periodId ? `?periodId=${periodId}` : ''}`);
      const rows = ((data as any)?.rows || []).filter((r: any) => r.periodValue || r.ytdValue);
      const brief = rows.map((r: any) => `${r.rowName}: 本期 ${fmt(r.periodValue)} / 累计 ${fmt(r.ytdValue)}`).join('\n');
      return reply(`利润表:\n${brief || '该期间无数据'}`, data);
    },
  );

  server.tool(
    'get_cash_flow',
    '获取现金流量表(经营/投资/筹资三大活动,含期末期初现金勾稽)',
    {
      year: z.number().describe('年份,如 2026'),
      month: z.number().describe('月份 1-12'),
    },
    async ({ year, month }) => {
      const data = await api('GET', `/reports/cash-flow?year=${year}&month=${month}`);
      const check = (data as any)?.balanceCheck;
      const rows = ((data as any)?.rows || []).filter((r: any) => r.periodValue || r.ytdValue);
      const brief = rows.map((r: any) => `#${r.no} ${r.name}: 本期 ${fmt(r.periodValue)}`).join('\n');
      return reply(`现金流量表 ${year}-${month}(勾稽${check?.balanced ? '平衡' : '存在差异!'}):\n${brief}`, data);
    },
  );

  server.tool(
    'query_subject_balances',
    '查询科目余额表(期初/本期发生/期末,可按层级折叠)。用于「XX科目余额多少」类问题',
    {
      year: z.number().describe('年份'),
      month: z.number().describe('月份 1-12'),
      level: z.number().optional().describe('科目层级折叠(1=一级科目),不传返回全部末级'),
    },
    async ({ year, month, level }) => {
      const data = await api('GET', `/reports/balance-summary?year=${year}&month=${month}${level ? `&level=${level}` : ''}`);
      const list = ((data as any)?.list || []) as Array<{ code: string; name: string; closeDebit: number; closeCredit: number }>;
      const lines = list
        .filter((r) => r.closeDebit || r.closeCredit)
        .map((r) => `${r.code} ${r.name}: 期末 ${fmt(r.closeDebit || r.closeCredit)}${r.closeCredit && !r.closeDebit ? '(贷)' : ''}`);
      return reply(`科目余额表 ${year}-${String(month).padStart(2, '0')}(有余额科目):\n${lines.join('\n') || '全部科目余额为零'}`, data);
    },
  );

  server.tool(
    'query_vouchers',
    '查询凭证列表(分页,按日期/状态过滤)。status: 0草稿 1待审核 2已记账,不传返回全部',
    {
      page: z.number().optional().describe('页码,默认 1'),
      pageSize: z.number().optional().describe('每页条数,默认 20'),
      from: z.string().optional().describe('起始日期 YYYY-MM-DD'),
      to: z.string().optional().describe('结束日期 YYYY-MM-DD'),
      status: z.number().optional().describe('0草稿 1待审核 2已记账'),
    },
    async ({ page, pageSize, from, to, status }) => {
      const q = new URLSearchParams({ page: String(page || 1), pageSize: String(pageSize || 20) });
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      if (status != null) q.set('status', String(status));
      const data = await api('GET', `/vouchers?${q.toString()}`);
      const list = (data as any)?.list || (data as any) || [];
      const rows = list.map((v: any) => `${v.word}-${v.no} ${String(v.date).slice(0, 10)} ${v.status === 2 ? '已记账' : v.status === 1 ? '待审核' : '草稿'} ${v.memo || ''} ¥${fmt(v.totalDebit)}`);
      return reply(`凭证 ${rows.length} 条:\n${rows.join('\n') || '无符合条件的凭证'}`, data);
    },
  );

  server.tool(
    'query_arap_aging',
    '查询应收账款账龄分析(0-30/31-60/61-90/90天以上)与逾期情况',
    {},
    async () => {
      const data = await api('GET', '/arap/aging?type=1');
      return reply('应收账款账龄分析如下。', data);
    },
  );

  server.tool(
    'query_expense_claims',
    '查询费用报销单(按状态过滤)。status: 0草稿 1部门审批 2总经理审批 3财务复核 4待付款 5已付款 6已驳回',
    { status: z.number().optional().describe('报销单状态') },
    async ({ status }) => {
      const q = status != null ? `?status=${status}` : '';
      const data = await api('GET', `/expense-claims${q}`);
      const list = (data as any)?.list || (data as any) || [];
      const rows = list.map((c: any) => `#${c.id} ${c.applicantName || ''} ¥${fmt(c.amount)} ${c.statusName || c.currentNode || ''} ${c.title || ''}`);
      return reply(`报销单 ${rows.length} 条:\n${rows.join('\n') || '无符合条件的报销单'}`, data);
    },
  );

  // ---------- 写入类(记账) ----------

  server.tool(
    'create_voucher',
    '录入记账凭证(草稿)。借贷必须平衡且至少两行;科目须为末级;期间已结账会被拒绝。需要部门辅助核算的科目按名称匹配:填 departmentName(如「综合部」);往来单位辅助核算暂不支持(请避开 1121/1122/2202 等)。保存后为草稿,需人工提交审核(制审分离)',
    {
      date: z.string().describe('记账日期 YYYY-MM-DD,须在未结账期间内'),
      memo: z.string().optional().describe('凭证备注(整单)'),
      entries: z.array(
        z.object({
          summary: z.string().describe('本行摘要,如「支付10月房租」'),
          subjectCode,
          debit: money.optional().describe('借方金额(与 credit 二选一)'),
          credit: money.optional().describe('贷方金额(与 debit 二选一)'),
          departmentName: z.string().optional().describe('部门名称(科目需部门辅助核算时必填,如「综合部」)'),
        }),
      ).min(2).describe('分录行,至少两行,借贷合计必须相等'),
    },
    async ({ date, memo, entries }) => {
      // 科目编码 → id(缓存科目树)
      const tree = await api('GET', '/subjects/tree');
      const flat: Array<{ id: number; code: string; name: string; isLeaf: boolean }> = [];
      const walk = (nodes: any[]) => {
        for (const n of nodes || []) {
          flat.push({ id: n.id, code: n.code, name: n.name, isLeaf: !!n.isLeaf });
          walk(n.children || []);
        }
      };
      walk(tree?.list || tree || []);
      const byCode = new Map(flat.map((s) => [s.code, s]));
      for (const e of entries) {
        if (!byCode.has(e.subjectCode)) {
          throw new Error(`科目编码 ${e.subjectCode} 不存在,可用编码示例:${flat.filter((s) => s.isLeaf).slice(0, 8).map((s) => `${s.code}=${s.name}`).join('、')} …(可用 query_subject_balances 查询科目)`);
        }
      }
      // 部门辅助核算:按名称匹配部门档案
      const needDept = entries.some((e) => e.departmentName);
      let deptByName = new Map<string, number>();
      if (needDept) {
        const depts: any = await api('GET', '/departments');
        const arr = Array.isArray(depts) ? depts : (depts?.list || []);
        deptByName = new Map(arr.map((d: any) => [String(d.name), d.id]));
      }
      const data = await api('POST', '/vouchers', {
        date,
        memo,
        entries: entries.map((e) => {
          const subject = byCode.get(e.subjectCode)!;
          let departmentId: number | undefined = undefined;
          if (e.departmentName) {
            departmentId = deptByName.get(e.departmentName);
            if (!departmentId) throw new Error(`部门「${e.departmentName}」不存在,请确认部门档案名称`);
          }
          return {
            summary: e.summary,
            subjectId: subject.id,
            debit: e.debit || 0,
            credit: e.credit || 0,
            ...(departmentId ? { departmentId } : {}),
          };
        }),
      });
      return reply(
        `凭证已保存为草稿(单号 ${data?.word || '记'}-${data?.no}),请登录 LedgerFlow 由有审核权限的用户提交审核后记账。`,
        data,
      );
    },
  );

  return server;
}

async function main() {
  // 启动即登录一次,让配置错误尽早暴露(智能体连接时不会莫名卡住)
  token = await login();
  const server = await buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio 模式下日志只能走 stderr,stdout 属于协议信道
  console.error(`[LedgerFlow MCP] 已启动: ${API_BASE}(user: ${MCP_USERNAME})`);
}

main().catch((e) => {
  console.error('[LedgerFlow MCP] 启动失败:', e.message);
  process.exit(1);
});
