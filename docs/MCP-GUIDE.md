# LedgerFlow MCP 接入指南(AI 智能体)

LedgerFlow 内置 **MCP Server**(Model Context Protocol),Claude Desktop、Cursor、Windsurf 等任何支持 MCP 的智能体,接入后可直接用自然语言**查账、出报表、记账**——相当于给你的 AI 装上一个财务记账员。

## 能做什么(10 个工具)

| 工具 | 说明 |
| --- | --- |
| list_periods | 会计期间与结账状态 |
| get_dashboard | 经营看板(资金/利润/应收/趋势) |
| get_balance_sheet | 资产负债表(含平衡校验) |
| get_income_statement | 利润表(本期/年累计) |
| get_cash_flow | 现金流量表(三大活动+勾稽) |
| query_subject_balances | 科目余额表(支持层级折叠) |
| query_vouchers | 凭证查询(日期/状态/分页) |
| query_arap_aging | 应收账款账龄分析 |
| query_expense_claims | 报销单查询 |
| create_voucher | **记账**(草稿;借贷平衡/末级科目/期间锁全部走系统校验;部门辅助核算按名称自动匹配) |

试试对 AI 说:「这个月利润多少?」「现金流量表给我看一下」「帮我记一笔:综合部报销办公费 200,现金支付」「应收账款账龄分布」。

## 前置条件

1. LedgerFlow 后端已运行(默认 http://127.0.0.1:3100);
2. 准备一个**专用账号**(建议:系统管理 → 用户管理 → 新建用户,角色给「会计」或自定义只读角色,密码强随机)。不要把管理员账号给智能体;
3. 完成 server 端构建:`cd server && pnpm build`(产物 dist/mcp/server.js)。

## Claude Desktop 配置

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`(macOS):

```json
{
  "mcpServers": {
    "ledgerflow": {
      "command": "node",
      "args": ["/Users/你的用户名/DeepSeek/FinancialManagement/server/dist/mcp/server.js"],
      "env": {
        "MCP_API_BASE": "http://127.0.0.1:3100/api/v1",
        "MCP_USERNAME": "ai-agent",
        "MCP_PASSWORD": "你的强随机密码"
      }
    }
  }
}
```

重启 Claude Desktop,聊天框出现工具图标即接入成功。

## Cursor 配置

项目根 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ledgerflow": {
      "command": "node",
      "args": ["server/dist/mcp/server.js"],
      "env": {
        "MCP_API_BASE": "http://127.0.0.1:3100/api/v1",
        "MCP_USERNAME": "ai-agent",
        "MCP_PASSWORD": "你的强随机密码"
      }
    }
  }
}
```

## 通用(其他 MCP 客户端)

- 传输方式:stdio
- 服务名:ledgerflow v1.0.0
- 启动命令:`node server/dist/mcp/server.js`
- 环境变量:`MCP_API_BASE`(API 地址)/ `MCP_USERNAME` / `MCP_PASSWORD`
- 本地自检:`cd server && node scripts/mcp-smoke.mjs`(需后端在运行)

## 安全说明

- **写操作只到「草稿」**:create_voucher 生成的凭证需人工在系统里提交审核——制审分离是硬规则,AI 也不例外;
- **同权同审计**:智能体走的每个请求与 Web 前端完全同链路(JWT 鉴权、RBAC、操作日志),越权行为在服务端被同样拒绝;
- **建议专用账号 + 最小权限**:只读需求给只读角色;不把 CFO/管理员账号交给智能体;
- 密码只写在 MCP 客户端配置(本机),不经任何第三方。
