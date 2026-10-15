# LedgerFlow 交付进度记录

> 更新:2026-10-15(梦哥 · 全量交付日)

## 已完成

| # | 事项 | 结果 |
| --- | --- | --- |
| 1 | 全项目体检(前后端 20+ 模块/30+ 页面) | 输出问题清单,见 findings.md |
| 2 | B1 修复:报销 180 天时效误判(冻结演示账套) | 引入业务时钟 `business-time.ts`,submit/update 两处时效校验改按账套当前期间;E2E 复测通过 |
| 3 | B2 修复:付款/红冲默认日期触发期间锁 | pay 默认日期、红冲 flushDate 改业务时钟;实测红冲落 2026-02-28 ✓ |
| 4 | 附件影像功能端到端打通 | VoucherEdit 上传/列表/下载(#actions 槽修复)、后端 multipart+计数事务;attachment-e2e.mjs 全绿 |
| 5 | 附件后端无 DELETE 路由 | 明确为设计取舍(已上传附件仅可追加),文档已注明 |
| 6 | 品牌统一 LedgerFlow | 登录页 brand-name/brand-tag、index.html title、路由 title 后缀、README |
| 7 | README 国际范门面化 | 徽章 + 英文 tagline + 13 张功能截图 + mermaid 架构图 + 泛化数据库命令($PGUSER) |
| 8 | 冒烟测试第 5 项不可靠(ElMessage 弹窗竞态) | 改为确定性断言:Element Plus 组件样式注入 5 项;10/10 全绿 |
| 9 | E2E 报销日期回归(改业务时钟后) | e2e.mjs 发生日期改用账套期间内固定日期 2026-02-15;44/44 全绿 |
| 10 | GitHub 推送 | https://github.com/iMENGiCHAO/LedgerFlow(私有) |

## 环境事故与处置(2026-10-14 晚)

- PostgreSQL 5432 突然不可达:排查发现本机存在 5 个 PG 数据目录/3 个 LaunchAgent,
  实际服务由 brew `postgresql@16`(数据目录 `/usr/local/var/postgresql@16`)提供;
  `com.local.postgres.plist` 指向 14 二进制 + 16 目录,版本不兼容反复 FATAL(干扰源)。
- 处置:停掉错误 plist 的反复拉起,确认 postgresql@16 自愈接管 5432,`financial_mgmt` 16 张凭证完好。
- 结论(给后续运维):**只需保留 brew services 的 postgresql@16**;`com.local.postgres.plist` 建议删除(14 起不来 16 的目录,只产日志噪音);`server/pg-data`(PG18 残留)是历史事故产物,已在 .gitignore。

## 最终回归(2026-10-15)

- 后端:build ✓ / 单元 5/5 ✓ / E2E 44/44 ✓
- 前端:build ✓ / 冒烟 10/10 ✓ / 附件端到端 ✓
- B1/B2 针对性实测:2026-01-20 报销单提交通过(业务时钟);无参红冲落 2026-02-28(期间锁安全)
