import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Icons from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import * as FmComponents from './components'
import './style.css'

// Element Plus 组件/样式改为按需引入:由 vite.config.ts 的
// AutoImport + Components 插件(ElementPlusResolver)自动注入,不再全量注册。
// 中文 locale 由 App.vue 的 <el-config-provider> 全局提供。

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 全局注册 Element Plus 图标
for (const [name, comp] of Object.entries(Icons)) {
  app.component(name, comp as never)
}

// 全局注册项目级通用组件(模板中直接 <StatCard /> / <SectionCard /> ...)
for (const [name, comp] of Object.entries(FmComponents)) {
  app.component(name, comp as never)
}

app.mount('#app')
