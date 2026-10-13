import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// 后端已通过 PGlite 桥接 Prisma 启动 (/api 代理到 127.0.0.1:3100)
// mock 插件保留但不再注册,需要时取消注释 createMockApiPlugin 即可
// import { createMockApiPlugin } from './vite-mock-plugin'

export default defineConfig({
  plugins: [
    vue(),
    // Element Plus 按需引入:模板组件自动 import + 样式自动注入,
    // ElMessage/ElMessageBox 等命令式 API 的样式也由 resolver 一并处理
    AutoImport({
      resolvers: [ElementPlusResolver()],
      // 项目已显式 import 的 API 不受影响;此插件只为补齐运行时按需样式
      dts: false,
      eslintrc: { enabled: false },
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2048,
  },
})
