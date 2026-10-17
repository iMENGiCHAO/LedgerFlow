/**
 * MCP Server 冒烟测试:
 * 用官方 SDK Client 以 stdio 方式拉起 MCP server 子进程,
 * 走真实 JSON-RPC 协议验证 initialize → tools/list → 多个 tools/call。
 *
 * 前置:LedgeFlow 后端已运行于 API_BASE(默认 127.0.0.1:3100)。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const API_BASE = process.env.MCP_API_BASE || 'http://127.0.0.1:3100/api/v1';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/mcp/server.js'],
  env: {
    ...process.env,
    MCP_API_BASE: API_BASE,
    MCP_USERNAME: process.env.MCP_USERNAME || 'zhangsan',
    MCP_PASSWORD: process.env.MCP_PASSWORD || 'Acc@123',
  },
});

const client = new Client({ name: 'ledgerflow-smoke', version: '1.0.0' });
await client.connect(transport);

// 1) tools/list
const tools = await client.listTools();
console.log(`========== MCP 冒烟(tools=${tools.tools.length}) ==========`);
check('工具数量 ≥ 10', tools.tools.length >= 10, `${tools.tools.length} 个: ${tools.tools.map((t) => t.name).join(', ')}`);

// 2) list_periods
const periods = await client.callTool({ name: 'list_periods', arguments: {} });
const periodsText = (periods.content?.[0]?.text || '');
check('list_periods 返回期间', periodsText.includes('2026-'), periodsText.split('\n')[0]);

// 3) get_dashboard
const dash = await client.callTool({ name: 'get_dashboard', arguments: {} });
check('get_dashboard 看板数据', (dash.content?.[0]?.text || '').length > 10);

// 4) get_cash_flow(2026-02:种子态有现金流动)
const cf = await client.callTool({ name: 'get_cash_flow', arguments: { year: 2026, month: 2 } });
const cfText = cf.content?.[0]?.text || '';
check('get_cash_flow 现金流量', cfText.includes('现金流量表') && cfText.includes('勾稽'), cfText.split('\n')[0].slice(0, 60));

// 5) query_subject_balances(一级折叠)
const sb = await client.callTool({ name: 'query_subject_balances', arguments: { year: 2026, month: 2, level: 1 } });
check('query_subject_balances 科目余额', (sb.content?.[0]?.text || '').includes('1001') || (sb.content?.[0]?.text || '').includes('科目'));

// 6) create_voucher(写路径:AI 记账)
const cv = await client.callTool({
  name: 'create_voucher',
  arguments: {
    date: '2026-02-15',
    memo: 'MCP 智能体冒烟记账',
    entries: [
      { summary: 'MCP 冒烟-办公费', subjectCode: '560201', debit: 123.45, departmentName: '综合部' },
      { summary: 'MCP 冒烟-办公费', subjectCode: '100201', credit: 123.45 },
    ],
  },
});
const cvText = cv.content?.[0]?.text || '';
check('create_voucher AI 记账', cvText.includes('草稿'), cvText.split('\n')[0].slice(0, 60));

// 7) query_vouchers(应能查到刚记的)
const qv = await client.callTool({ name: 'query_vouchers', arguments: { page: 1, pageSize: 50, from: '2026-02-15', to: '2026-02-15' } });
const qvText = qv.content?.[0]?.text || '';
check('query_vouchers 查到冒烟凭证', qvText.includes('MCP 冒烟') || qvText.includes('123'), qvText.split('\n')[0].slice(0, 50));

// 8) 记账后清理:走 API 删除(冒烟不留痕)
{
  const login = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.MCP_USERNAME || 'zhangsan', password: process.env.MCP_PASSWORD || 'Acc@123' }),
  }).then((r) => r.json());
  const tok = login?.data?.accessToken;
  const list = await fetch(`${API_BASE}/vouchers?page=1&pageSize=100`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json());
  const target = (list?.data?.list || []).find((v) => v.memo === 'MCP 智能体冒烟记账');
  if (target) {
    await fetch(`${API_BASE}/vouchers/${target.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } });
    check('清理冒烟凭证', true);
  } else {
    check('清理冒烟凭证', false, '未找到');
  }
}

await client.close();

const failed = results.filter((r) => !r).length;
console.log(`========== MCP 冒烟结果:${results.length - failed} / ${results.length} ==========`);
if (failed) process.exit(1);
console.log('✅ MCP Server 全链路冒烟通过');
process.exit(0);
