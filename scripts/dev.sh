#!/usr/bin/env bash
# 一键启动开发环境:后端 tsx watch 热重载(3100) + 前端 Vite Dev(5173)
# 前置:server/.env 已配置 DATABASE_URL,数据库已 db:push + db:seed(见 README)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/server"

# 后端:开发模式使用 tsx watch(源码热重载),无需先 build
if pgrep -f "tsx watch src/main.ts" > /dev/null 2>&1; then
  echo "[FM] 后端(dev)已在运行 http://127.0.0.1:3100"
else
  # 若端口被生产进程(dist)占用则提示退出,避免新旧混跑
  if pgrep -f "node dist/main.js" > /dev/null 2>&1; then
    echo "[FM] 检测到生产模式后端(node dist/main.js)在运行,请先停止它再启动开发模式"
    exit 1
  fi
  echo "[FM] 启动后端(dev, 热重载) http://127.0.0.1:3100 ..."
  nohup pnpm dev > /tmp/fm-server.log 2>&1 &
  echo "[FM] 日志: tail -f /tmp/fm-server.log"
  sleep 2
fi

cd "$ROOT/web"
echo "[FM] 启动前端 http://localhost:5173 ..."
pnpm dev
