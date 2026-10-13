/**
 * PGlite TCP 桥
 *
 * 目的:在 DeepSeek Harness 沙箱（禁止 fork 多线程进程、PG 服务无法启动）下,
 *       把 PGlite (WASM PG) 暴露成 PG 协议,让 Prisma 完全无感使用。
 *
 * 使用:
 *   node pg-bridge.mjs          # 启动后台进程,持久化到 ./pg-data
 *   kill <pid>                  # 停止
 *
 * 监听 127.0.0.1:5432,Prisma 配置无需改动。
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { existsSync } from 'node:fs'

const DATA_DIR = './pg-data'

console.log('[PG-Bridge] 启动中...')
const db = await PGlite.create({ dataDir: DATA_DIR })
console.log(`[PG-Bridge] PGlite 加载完成 · 持久化目录: ${DATA_DIR}`)

const server = new PGLiteSocketServer({
  db,
  port: 5432,
  host: '127.0.0.1',
  maxConnections: 30,
})

await server.start()
console.log('[PG-Bridge] ✓ 已监听 127.0.0.1:5432 · Prisma 可直接连接')

process.on('SIGINT', async () => {
  console.log('\n[PG-Bridge] 收到 SIGINT,关闭中...')
  await server.stop()
  await db.close()
  console.log('[PG-Bridge] 已停止')
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await server.stop()
  await db.close()
  process.exit(0)
})
