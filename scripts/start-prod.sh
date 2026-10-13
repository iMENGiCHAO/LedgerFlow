#!/usr/bin/env bash
# 生产/演示模式:构建前端 → 启动后端(3100) + Vite Preview 静态服务(5173,代理 /api)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[FM] 构建后端..."
cd "$ROOT/server"
pnpm build

echo "[FM] 同步数据库结构并灌注种子数据(幂等)..."
pnpm exec prisma db push --skip-generate >/dev/null
pnpm exec tsx prisma/seed.ts | tail -2 || true

if ! pgrep -f "node dist/main.js" > /dev/null; then
  echo "[FM] 启动后端 http://127.0.0.1:3100 ..."
  nohup node dist/main.js > /tmp/fm-server.log 2>&1 &
  sleep 3
else
  echo "[FM] 后端已在运行"
fi

echo "[FM] 构建前端..."
cd "$ROOT/web"
pnpm build

echo "[FM] 启动前端服务 http://localhost:5173 ..."
pnpm exec vite preview --port 5173 --host
