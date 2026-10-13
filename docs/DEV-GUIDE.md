# 开发指南

> **目标读者**:日常开发 / 改 BUG / 加功能
> **前置**:`HANDOVER.md` § 1-2 + `ARCHITECTURE.md` § 2-3

---

## 1. 开发环境

```bash
# Node.js ≥ 20(开发用 v24)
node -v

# pnpm
npm install -g pnpm
pnpm -v

# PostgreSQL
brew install postgresql@17   # macOS
brew services start postgresql@17

# 工具
brew install jq
brew install --cask visual-studio-code
```

VSCode 推荐插件:
- Vue Language Features (Volar)
- ESLint
- Prisma
- Thunder Client(REST 测试)
- DotENV

---

## 2. 工作流

### 2.1 日常开发

```bash
bash scripts/dev.sh
# 后端 :3100,日志实时
# 前端 :5173,HMR 改即生效
```

改文件后:
- 前端 `web/src/**` → Vite HMR 自动热替换
- 后端 `server/src/**` → `tsc -w` 监听,但 `node dist/main.js` 不会自动重启;**需要手动重启**:

```bash
# 重启后端
pkill -f "node dist/main.js"
cd server && node dist/main.js &
```

### 2.2 改后端代码的标准循环

```bash
# 1. 改 server/src/...
# 2. 重新编译
cd server
pnpm run build        # tsc → dist/

# 3. 重启进程(如果 dev 模式)
pkill -f "node dist/main.js"
node dist/main.js &

# 4. 验证
curl http://localhost:3100/api/v1/system/health
# 或浏览器 F12 看 Network
```

### 2.3 数据库改了怎么办

```bash
# 1. 改 server/prisma/schema.prisma
# 2. 开发:db push(直接推,无迁移文件)
pnpm exec prisma db push

# 3. 生产:migrate(写迁移文件,可回滚)
pnpm exec prisma migrate dev --name <your-change>

# 4. 重新生成 client
pnpm exec prisma generate
```

⚠️ **db push 不会写迁移文件,生产环境永远用 migrate**。

---

## 3. 目录规约

### 3.1 后端

| 文件 | 必须 |
|---|---|
| `*.module.ts` | 注入 PrismaService + 其他 service |
| `*.service.ts` | 业务逻辑,纯 TS |
| `*.controller.ts` | HTTP 接口,装饰器,调 service |
| `*.dto.ts` | (可选)class-validator 入参校验 |
| `*.entity.ts` | (本项目不用 Prisma 实体,直接 prisma client) |

每个 service 方法都接收 `tenantId` 作为**第一参数**(必须,跨账套防御的关键)。

### 3.2 前端

| 文件 | 必须 |
|---|---|
| `views/<module>/<Page>.vue` | `<script setup lang="ts">` Composition API |
| `api/modules.ts` | 集中声明所有 API,**不要在 vue 里直接调 axios** |
| `stores/auth.ts` | 唯一改 token/user 的地方 |
| `components/` | 复用 UI,业务无关 |

每个页面顶部结构:
```vue
<template>
  <PageHeader title="..." subtitle="..." icon="...">
    <template #actions>
      <el-button @click="onExport">导出</el-button>
    </template>
  </PageHeader>
  <SectionCard title="...">...</SectionCard>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { someApi } from '@/api/modules'

const list = ref([])
async function load() {
  list.value = await someApi()
}
onMounted(load)
</script>
```

---

## 4. 编码规范

### 4.1 TypeScript

- 严格模式 `"strict": true`(tsconfig.json 已开)
- 不用 `any`,真不知道类型用 `unknown` + type guard
- 接口返回统一 `interface XxxResp`
- 函数式优先,慎用类

### 4.2 Vue 3

- 永远 `<script setup lang="ts">`
- ref vs reactive:`ref` 统一,简单对象用 `reactive`
- computed 必须有名字
- emit 用 `defineEmits(['change'])`
- 组件 props 必填必标 `required: true`

### 4.3 命名

| 类别 | 风格 | 例子 |
|---|---|---|
| 类 / 接口 | PascalCase | `VoucherService` |
| 函数 / 变量 | camelCase | `listVouchers` |
| 常量 | UPPER_SNAKE | `JWT_SECRET` |
| 数据库表 | snake_case | `voucher_entry` |
| Prisma model | PascalCase → snake_case 表 | `Voucher` → `voucher` |
| 文件 | kebab-case | `voucher.service.ts` / `VoucherApprove.vue` |

### 4.4 注释

- **公共函数**:JSDoc
- **业务规则**:引用 R1-R19 编号
- **hack 代码**:必加 `// FIXME:` `// TODO:`
- **不复述代码**,解释为什么

---

## 5. 常见开发任务

### 5.1 加个新 API

**后端** (`server/src/modules/<module>/<module>.controller.ts`):

```ts
@Post('something')
@Perm('module:create')
async createSomething(
  @CurrentTid() tenantId: number,
  @CurrentUser() user: SessionUser,
  @Body() dto: SomeDto,
  @OpLog('业务名', { biz: 'something' })
) {
  return this.service.create(tenantId, user, dto)
}
```

**前端** (`web/src/api/modules.ts`):

```ts
export const createSomething = (data: SomeData) =>
  client.post('/something', data).then((r) => r.data)
```

### 5.2 加个新页面

```bash
# 1. 写 vue
web/src/views/<module>/SomePage.vue

# 2. 路由
web/src/router/index.ts
{ path: 'module/some', name: 'some', component: () => import('@/views/module/SomePage.vue'), meta: { title: '某页', perm: ['module:view'] } }

# 3. 菜单
web/src/layout/MainLayout.vue (如果菜单是动态配置,改 config)
```

### 5.3 加个新权限

1. `server/src/constants/perms.ts` 加 `'something:create'`
2. `server/src/constants/roles.ts` 角色里加
3. controller 加 `@Perm('something:create')`
4. 前端 `v-perm` 或 `auth.hasPerm('something:create')`

### 5.4 改 schema

⚠️ **生产环境**:
1. `prisma migrate dev --name your_change`
2. 提交迁移文件 `prisma/migrations/<timestamp>_your_change/`
3. CI/CD 用 `prisma migrate deploy`

**开发环境**:
1. `prisma db push`(直接推)

---

## 6. 调试技巧

### 6.1 后端

```bash
# 日志:NestJS 默认打到 stdout
NODE_ENV=development pnpm run start:dev   # ts-node 热重载(本项目用 build + node)
# 或
node --inspect dist/main.js
# Chrome 打开 chrome://inspect
```

**单测**:`server/src/**/*.spec.ts` → `pnpm run test`

### 6.2 前端

- F12 → Console / Network / Application(LocalStorage)
- Vite HMR 状态:`/node_modules/.vite/deps/` 是否更新
- Vue Devtools 扩展
- 路由调试:`router.currentRoute.value` 在 console

### 6.3 端到端

```bash
cd server
node scripts/e2e.mjs
```

44 个断言,跑通基本就能上。

### 6.4 复杂问题查法

| 症状 | 查 |
|---|---|
| 接口 500 | 后端日志 + Prisma 错误栈 |
| 接口 401 | JWT 过期 / 黑名单 / token 没带 |
| 接口 403 | perm 不够 / 越权防御 |
| 前端白屏 | F12 + Vite HMR 编译错误 |
| 导出 0KB | `Content-Type` 是否 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| 凭证不保存 | 借贷不平 / 末级 / 辅助核算 |
| 报表不平 | `未分配利润` → 3103 余额 + 当年损益 |

---

## 7. 改 BUG 流程

1. **复现**:`http://localhost:5173/system/health` 健康检查 + 手动操作
2. **定位**:
   - 5xx → 后端日志
   - 4xx → 看 message
   - 前端问题 → console + Network
3. **最小修复**:**只改必要的,不要顺手 refactor**
4. **回归**:`node scripts/e2e.mjs`
5. **记录**:`docs/工作日记.md` 加一行

### 7.1 改 BUG checklist

- [ ] 找到了 root cause,不是表面
- [ ] 修复后,类似问题也修了(系统性,而非点状)
- [ ] 写了 E2E 断言(如果是回归风险)
- [ ] 没引入新依赖
- [ ] 改的代码不被 type-check 警告
- [ ] 后端重新 build 成功
- [ ] 浏览器 console 无 error
- [ ] 健康检查 14/14 过

---

## 8. 性能 Profiling

### 8.1 后端

```bash
# 慢查询:Prisma 日志
# server/src/prisma.service.ts:
log: [{ level: 'query', emit: 'event' }, ...]
# + this.$on('query', ...)

# Node.js CPU profile
node --prof dist/main.js
node --prof-process isolate-*.log
```

### 8.2 前端

- Chrome DevTools → Performance / Lighthouse
- Vue Devtools 组件渲染时间

### 8.3 关键指标

| 指标 | 目标 |
|---|---|
| 首屏 TTI | < 2s |
| 列表页 100 条 | < 500ms |
| 报表(12 月) | < 1s |
| 凭证创建 | < 200ms |
| Excel 导出(1000 行) | < 1s |

---

## 9. Git 流程

```bash
# 1. 拉最新
git pull --rebase

# 2. 建分支
git checkout -b feat/add-bonus

# 3. 改 + commit
git add .
git commit -m "feat: 加个奖金计算模块"

# 4. 跑测试
cd server && pnpm run test && node scripts/e2e.mjs

# 5. push + PR
git push origin feat/add-bonus
```

### commit 规范

```
feat: 新功能
fix:  修 BUG
docs: 文档
refactor: 重构(不修 BUG 不加功能)
test: 加测试
chore: 杂项
```

---

## 10. 踩坑清单(持续更新)

| 坑 | 解 |
|---|---|
| 后端改了代码,前端没变 | 编译后没重启进程,前端 HMR 跟新接口对不上 |
| Prisma Decimal 加减 | 用 `new Prisma.Decimal(a).plus(b)`,不要 `+` |
| JWT 过期 | 401 → 调 `/auth/refresh` → 失败跳登录 |
| Element Plus 弹窗被遮罩 | 检查父级 `z-index` |
| 跨账套访问 | 必须带 `tenantId` 参数,不能只靠前端 |
| 时间字符串 | 全部用 ISO 8601 + UTC,前端用 `new Date()` 转 |
| Decimal 显示 | 前端不要 `Number()`,直接 toString 或 toFixed |
| 附件上传大文件 | `multer` 内存限制 + `client_max_body_size` |
| 多账套 cookie | JWT 里带 `tc`(当前账套),刷新带新值 |
| Excel 数字被科学计数 | 单元格式 `0.00` 或 `#,##0.00` |

---

## 11. 上线前自检清单

- [ ] `pnpm run test` 全过
- [ ] `node scripts/e2e.mjs` 44/44
- [ ] 健康检查页 14/14 通过
- [ ] 浏览器 console 无 error
- [ ] 5 个角色都登录过,看到对应菜单
- [ ] 6 类业务模块各导出 1 次 Excel,Mac/Excel/WPS 都能打开
- [ ] 改 admin 默认密码
- [ ] `JWT_SECRET` 改强
- [ ] `VITE_ENABLE_DEMO=false`
- [ ] 数据备份 + 恢复演练一次
