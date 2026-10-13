# 分析发现（持续更新）

## 项目概况
- 中小企业财务管理系统：NestJS 10 + Prisma 6 + PostgreSQL 17 后端（server/，~6800 行），Vue3 + Element Plus + ECharts 前端（web/，~15200 行）
- 功能完整：建账/凭证/账簿/报表/结账 + 应收应付/发票/资金/报销/固定资产/看板
- 文档齐全（10+ 篇），自带 44 断言 E2E + 单元测试

## 已确认的问题

### P0（阻塞交付，已修复/需修复）
1. ✅ 已修：web/pnpm-workspace.yaml 中 `@parcel/watcher: set this to true or false` 是无效占位符，导致 pnpm build 触发交互失败 → 改为 true
2. ⚠️ 待修：server `pnpm install` 后没有 postinstall prisma generate，构建直接 TS 报错（新环境不可复现构建）→ 需加 postinstall 脚本
3. ⚠️ 环境：.env DATABASE_URL 用 zhouchao 角色，本机 PG 无该角色（已手动创建）。DEPLOY 文档需要写清初始化步骤

### P1（工程化债，来自 docs/不足与优化计划.md 且验证属实）
- db push 无迁移基线（生产升级不可回滚）→ 建议建 prisma migrate 基线
- dev.sh 逻辑缺陷：注释说开发模式却启动 `node dist/main.js`（依赖 dist 存在，新克隆直接失败）
- echarts 全量引入：index chunk 1.3MB / gzip 419KB，Dashboard chunk 1MB → 可按需引入减 60%
- CORS origin:true（任意来源）——生产需收紧
- JWT_SECRET 是弱演示值（.env 有提示但无强校验）

### P2（文档已知，非阻塞）
- 凭证附件上传前端控件缺失
- 无 Docker/CI/API 文档站点
- 日志只入库无轮转

## 构建状态
- server: prisma generate 后 tsc 通过 ✅（首装缺 generate 是坑）
- web: vite build 通过 ✅（1.3MB 主包待优化）
- DB: schema pushed + seeded ✅（6 演示账号 + 演示账套 2026-01 已结账 / 2026-02 进行中）
