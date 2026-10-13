# 部署手册

> **场景**:开发 / 演示 / 小企业生产部署
> **目标**:在 30 分钟内把系统跑起来

---

## 1. 环境要求

| 组件 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | LTS(开发验证用 v24) |
| pnpm | ≥ 9 | 包管理 |
| PostgreSQL | 15+ (验证用 17.11) | TCP 5432,数据库 `financial_mgmt` |
| 操作系统 | macOS / Linux / Windows WSL2 |  |
| 浏览器 | Chrome / Edge / Safari |  |

---

## 2. 三种启动模式

### 2.1 开发模式(代码改完自动 HMR)

```bash
# 一次性准备
psql -h 127.0.0.1 -U postgres -d postgres -c "CREATE DATABASE financial_mgmt ENCODING 'UTF8';"
cd server
pnpm install
pnpm exec prisma db push
pnpm run db:seed

# 启动
bash scripts/dev.sh
# 后端 http://localhost:3100/api/v1
# 前端 http://localhost:5173(默认 Network 也开)
```

### 2.2 生产/演示模式(单脚本)

```bash
bash scripts/start-prod.sh
# 自动:构建后端 + 构建前端 + 启 Node + 启 vite preview
# 浏览器:http://localhost:5173
```

脚本内部:
1. `cd server && pnpm install && pnpm exec prisma db push && pnpm run build`
2. `cd ../web && pnpm install && pnpm run build`
3. 后台启 `node dist/main.js`(端口 3100)
4. 后台启 `pnpm run preview`(端口 5173)

### 2.3 纯前端 + 远端后端(部署到服务器)

```bash
# 后端(放 :3100,推荐 systemd / PM2)
cd server
pnpm install --prod
pnpm exec prisma db push
pnpm run build
NODE_ENV=production node dist/main.js

# 前端(放 :5173,纯静态)
cd web
pnpm install
pnpm run build
# 产物在 web/dist/,用 nginx/apache 托管
```

---

## 3. 环境变量

### 3.1 `server/.env`

```bash
# 必填
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/financial_mgmt?schema=public
JWT_SECRET=<强随机 32+ 字符,openssl rand -hex 32>
PORT=3100

# 选填(有默认值)
NODE_ENV=production
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
ALLOW_ORIGIN=http://localhost:5173

# 种子(可选,改默认演示公司)
SEED_TENANT_NAME=北京智云科技股份有限公司
SEED_TENANT_TAXNO=91110105MA01ABCDXX
SEED_TENANT_ADDRESS=北京市朝阳区...
SEED_TENANT_LEGAL=陈志远
SEED_TENANT_START_YEAR=2026
SEED_TENANT_START_MONTH=1
```

⚠️ **`JWT_SECRET` 必须在生产改!** 留默认 = 公开密钥 = 任何人都能伪造 token。

### 3.2 `web/.env`

```bash
# 不填默认走 vite proxy /api → :3100

# 关闭演示账号(生产必填)
VITE_ENABLE_DEMO=false
```

---

## 4. 反向代理(生产 HTTPS)

### 4.1 Nginx 示例

```nginx
server {
  listen 443 ssl;
  server_name fm.example.com;

  ssl_certificate     /etc/letsencrypt/live/fm.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/fm.example.com/privkey.pem;

  # 前端静态
  root /opt/financial-management/web/dist;
  index index.html;

  # API 代理
  location /api/ {
    proxy_pass         http://127.0.0.1:3100;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    client_max_body_size 20m;   # 附件上传
  }

  # SPA 路由 fallback
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### 4.2 Apache 示例(同上思路)

```apache
<VirtualHost *:443>
  ServerName fm.example.com
  DocumentRoot /opt/financial-management/web/dist

  SSLEngine on
  SSLCertificateFile ...
  SSLCertificateKeyFile ...

  ProxyPass /api/ http://127.0.0.1:3100/api/
  ProxyPassReverse /api/ http://127.0.0.1:3100/api/

  <Directory />
    FallbackResource /index.html
  </Directory>
</VirtualHost>
```

---

## 5. 进程管理

### 5.1 systemd(推荐 Linux)

`/etc/systemd/system/fm-backend.service`:

```ini
[Unit]
Description=FM Backend
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=fm
WorkingDirectory=/opt/financial-management/server
EnvironmentFile=/opt/financial-management/server/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable fm-backend
sudo systemctl start fm-backend
sudo journalctl -u fm-backend -f   # 跟踪日志
```

### 5.2 PM2(更省心)

```bash
pnpm add -g pm2
pm2 start server/dist/main.js --name fm-backend
pm2 startup        # 开机自启
pm2 save
pm2 logs fm-backend
```

---

## 6. 数据备份

### 6.1 自动备份(系统内)

`系统管理 → 数据备份 → 一键备份 → 下载 .dump 文件`

### 6.2 手工

```bash
# 备份
pg_dump -h 127.0.0.1 -U fm -d financial_mgmt -Fc -f backup-$(date +%Y%m%d).dump

# 恢复
pg_restore -h 127.0.0.1 -U fm -d financial_mgmt --clean --if-exists backup-20260829.dump

# cron 每日凌晨 3 点
0 3 * * * /usr/bin/pg_dump -U fm -d financial_mgmt -Fc -f /backup/fm-$(date +\%Y\%m\%d).dump
```

### 6.3 附件

附件存在 `server/uploads/`(或配置的对象存储),备份时**一起 tar**:

```bash
tar czf fm-attachments-$(date +%Y%m%d).tar.gz server/uploads/
```

---

## 7. 监控 / 告警(简易)

| 指标 | 怎么监控 |
|---|---|
| 进程存活 | systemd / PM2 / UptimeRobot |
| HTTP 200 | UptimeRobot / 健康检查页 `GET /api/v1/system/health` |
| 数据库 | `pg_stat_activity` 定期查 |
| 磁盘 | `df -h`(防日志/附件爆盘) |
| 错误日志 | `journalctl -u fm-backend` / 接入 Sentry |

---

## 8. 升级流程

```bash
# 1. 拉新代码
cd /opt/financial-management
git pull

# 2. 装依赖
cd server && pnpm install
cd ../web && pnpm install

# 3. 数据库迁移(无破坏性时用 db push,生产用 migrate)
cd server
pnpm exec prisma migrate deploy   # 生产
# 或 pnpm exec prisma db push     # 开发

# 4. 重新构建
pnpm run build
cd ../web && pnpm run build

# 5. 重启
sudo systemctl restart fm-backend
# 前端不用重启,纯静态
```

### 回滚

```bash
git log --oneline -10
git checkout <上一个稳定 hash>
cd server && pnpm install && pnpm run build
sudo systemctl restart fm-backend
```

---

## 9. 常见部署问题

### 9.1 端口被占

```bash
lsof -i :3100   # 查谁占
kill <pid>      # 杀掉
```

### 9.2 静态文件 404

nginx `try_files` 没配 → 直接 404。配上 `try_files $uri $uri/ /index.html;`

### 9.3 跨域 CORS

如果前端 / 后端不同源 → 后端 `ALLOW_ORIGIN` 配前端域名,或 nginx 同源代理。

### 9.4 大附件上传失败

`client_max_body_size` 默认 1m,改 20m+。

### 9.5 进程莫名挂

看 `journalctl -u fm-backend -n 100`,99% 是:
- 内存溢出(`--max-old-space-size=4096`)
- 数据库连接满(`pgbouncer` 或减少 `connection_limit`)

---

## 10. 安全清单(上线前过一遍)

- [ ] `JWT_SECRET` 强随机(≥ 32 字符)
- [ ] `DATABASE_URL` 强密码
- [ ] 启用 HTTPS(Let's Encrypt 免费)
- [ ] 防火墙:只开 80/443,后端 3100 只 listen 127.0.0.1
- [ ] `web/.env` 关闭演示账号 `VITE_ENABLE_DEMO=false`
- [ ] admin 改默认密码
- [ ] 数据库每日自动备份 + 异地存储
- [ ] 操作日志定期审查(`系统管理 → 操作日志`)
- [ ] 限制数据库远程连接(`pg_hba.conf`)
- [ ] 升级到 Node 20 LTS(不再用 16/18)
- [ ] 启用 PostgreSQL SSL(`sslmode=require`)
