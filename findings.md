# 关键发现与体检结论(交付版)

> 2026-10-15 定稿 · 配套 progress.md / docs/不足与优化计划.md(权威 backlog)

## A. 已修复(本次交付内验证)

- **B1 报销时效误判**:时效校验用系统墙钟,冻结演示账套(2026-02)下 2026-01 的单据被判「超 180 天」。修复:业务时钟 `getBusinessToday()`(账套最早未结账期间末日),submit/update 两处接入。实测 2026-01-20 单据提交通过。
- **B2 期间锁冲突**:pay/红冲默认日期 `new Date()` 落已结账期间。修复:两处默认日期改业务时钟;实测无参红冲落 2026-02-28 ✓。
- **附件影像**:前端 #actions 槽渲染 + multipart 上传 + Blob 下载 + $transaction 计数;attachment-e2e.mjs 全绿。
- **品牌统一**:登录页/index.html/路由 title/README 全部 LedgerFlow。
- **测试可靠性**:冒烟 ElMessage 项改确定性样式注入断言;e2e 报销日期改账套期间口径。

## B. 报告型问题(不阻塞交付,建议后续迭代)

1. JWT 过期 2h,与文档「15 分钟」表述不一致 → 以 .env 实际为准,建议统一文档;
2. DATABASE_URL 带 pgbouncer 参数(connection_limit=1)但本机无 pgbouncer,Prisma 会忽略;生产接 pgbouncer 时才有意义;
3. web 无 vue-tsc 类型检查(vite build 不查模板类型)→ 建议 devDep 引入 vue-tsc 并入 CI;
4. 缺 prisma.config.ts(schema 与 tsconfig 分离,升级 Prisma 时注意);
5. seed 横幅提示「:3000」与实际 3100 不一致(仅提示文案);
6. vite.config.ts 存在过时 PGlite 注释(纯注释,无行为影响);
7. 附件无删除接口(设计取舍:凭证影像只增不删,防篡改;如需删除需另加权限与审计);
8. 服务器返回 404 时前端部分 catch 静默(拦截器已 toast,业务层无需重复)。

## C. 环境事实(运维必读)

- 真正服务 5432 的是 brew **postgresql@16**,数据目录 `/usr/local/var/postgresql@16`;
- `~/Library/LaunchAgents/com.local.postgres.plist` 是坏配置(14 二进制 + 16 目录),建议删除,否则反复 FATAL 写日志;
- `server/pg-data/` 是 PG18 残留数据目录(历史事故),已 .gitignore,勿提交勿启动;
- 本机另有 postgresql@14/17 的 brew 数据目录,均与本项目无关。

## D. 实用性评估

- 适合:中小企业内账/教学演示/二开底座(会计规则硬编码完整:借贷平衡、制审分离、期间锁、红冲、结账四检查);
- 现阶段不宜直接对外 SaaS:单实例、JWT 密钥默认值、无多租户硬隔离(靠 tenantId 软隔离)、附件本地盘;
- 工程化成熟度:测试(44 E2E + 单测 + 冒烟)与文档(6 份)齐备,达到「可交接可二开」。
