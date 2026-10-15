# 任务计划：财务管理系统完整分析与修复

## 目标
完整分析 FinancialManagement 项目（server + web），找出问题、评估实用性、检查工程化落地程度，并修复所有问题直到可交付使用。

## Phase 1: 项目全貌调查 `in_progress`
- 读 README、docs 核心文档
- 统计代码规模、技术栈、依赖
- 了解架构设计

## Phase 2: 后端深入分析 `pending`
- 数据库 schema、API 完整性
- 安全问题（鉴权、SQL 注入、密码存储等）
- 业务逻辑正确性（凭证记账、余额计算等）

## Phase 3: 前端深入分析 `pending`
- 构建是否通过、类型检查
- 页面功能完整性
- 与后端 API 对齐情况

## Phase 4: 运行验证 `pending`
- 启动 server + web，实际验证核心流程
- E2E 测试通过情况

## Phase 5: 修复问题 `pending`
- 按优先级修复所有阻塞交付的问题

## Phase 6: 交付验证 `pending`
- 全量回归：build、类型检查、E2E
- 输出分析报告

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|


## 错误日志(修复过程实录)

| # | 现象 | 根因 | 处置 |
| --- | --- | --- | --- |
| 1 | 附件上传按钮渲染后点击「未找到上传 input」 | SectionCard 只有 title/actions/default 槽,`#extra` 被静默丢弃 | 改用 `#actions` 槽,vite 构建产物验证 |
| 2 | 上传成功但前端计数不刷新/下载报错 | 拦截器已解包 `body.data`,handler 又取 `res.data` | 直接使用 resolved value;Blob objectURL 用后 revoke |
| 3 | 新建凭证后无法追加附件 | save() 写只读 computed、路径判断错误 | `createdVoucherId.value = Number(created.id)` |
| 4 | server build 失败:Prisma 类型不匹配 | 自定义 PrismaLike 协议与 Prisma 重载签名冲突 | business-time.ts 直接用 PrismaService 类型 |
| 5 | server build 失败:模块路径错误 | common→src 应为 `../prisma.service`(一层) | 修正 import 深度 |
| 6 | Tenant.currentPeriodId 不存在 | schema 无该字段,当前期间由 Period.status 表达(且多期同为 1) | 查询改为 findFirst(status=1)+orderBy 年月,取最早未结账期间 |
| 7 | E2E 第 8 节失败:「发生日期晚于今天」 | 业务时钟改为账套期间后,e2e 仍用系统今天-5 天 | e2e 发生日期改 2026-02-15(账套期间内),注释说明口径 |
| 8 | 冒烟 ElMessage 项偶发失败 | 保存按钮 disabled 竞态,弹窗断言不可靠 | 改为样式注入确定性断言(5 类组件 CSS) |
| 9 | 截图 ledgers/reports/expenses 三张相同 | 这些路由不存在,通配符重定向到 / | 核对 router 真实路径后重截 13 张 |
| 10 | login.png 截到 /expense/mine | 截图时 localStorage 已注入 token,/login 被重定向 | 独立脚本先 clear 再截,验证 brand=true |
| 11 | PG 5432 连接拒绝(服务全挂) | com.local.postgres(14 二进制)指向 16 数据目录,FATAL;真正服务是 brew postgresql@16 | 停错误 plist,确认 16 自愈,库完好 |
| 12 | README psql 命令含 shell 转义残留 | heredoc 单引号嵌套 | 修正为可直读复制的 `ENCODING 'UTF8'` |
| 13 | 多次编辑写入出现乱码碎片 | 工具输出污染 | 每步 node --check / grep 复核,坏文件整体重写 |
