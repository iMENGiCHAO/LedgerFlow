<template>
  <div class="health-page">
    <PageHeader title="系统健康检查" subtitle="一键检测前后端连通性、Token 状态、各业务模块" icon="DataAnalysis" />
    <SectionCard title="环境信息" icon="Cpu">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="前端 URL">{{ frontendUrl }}</el-descriptions-item>
        <el-descriptions-item label="后端 URL">{{ backendUrl }}</el-descriptions-item>
        <el-descriptions-item label="Vite Proxy">{{ proxyUrl }}</el-descriptions-item>
        <el-descriptions-item label="登录用户">{{ userInfo }}</el-descriptions-item>
        <el-descriptions-item label="Token 后 8 位">{{ tokenLast8 }}</el-descriptions-item>
        <el-descriptions-item label="浏览器">{{ ua }}</el-descriptions-item>
      </el-descriptions>
    </SectionCard>

    <SectionCard title="连通性 + 关键接口" icon="Link">
      <div class="probe-actions">
        <el-button type="primary" :icon="Refresh" :loading="running" @click="runAll">开始检测</el-button>
        <el-button :icon="Delete" @click="clearCache">清登录态</el-button>
        <el-button :icon="Download" @click="testExport" :loading="expRunning">测试 Excel 导出</el-button>
      </div>
      <el-table :data="results" v-loading="running" border>
        <el-table-column prop="name" label="接口" min-width="200" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'ok'" type="success" size="small">✅ 通过</el-tag>
            <el-tag v-else-if="row.status === 'fail'" type="danger" size="small">❌ 失败</el-tag>
            <el-tag v-else type="info" size="small">⏳ 待测</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="HTTP" width="80" align="center" prop="http" />
        <el-table-column label="耗时" width="100" align="right">
          <template #default="{ row }">{{ row.ms }}ms</template>
        </el-table-column>
        <el-table-column label="备注" min-width="240">
          <template #default="{ row }">
            <span class="remark">{{ row.note }}</span>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="lastExportResult" class="export-result">
        <el-alert :title="lastExportResult.title" :type="lastExportResult.type" :closable="false" show-icon>
          {{ lastExportResult.detail }}
        </el-alert>
      </div>
    </SectionCard>

    <SectionCard title="常见问题排查" icon="QuestionFilled">
      <ol class="checklist">
        <li>如果<strong>接口全 401</strong>:Token 失效,点上方"清登录态"重新登录</li>
        <li>如果<strong>Excel 导出 0KB</strong>:浏览器拦截了下载,检查浏览器下载设置;或后端 /api/v1/vouchers?format=xlsx 直接测一下大小</li>
        <li>如果<strong>点击按钮无反应</strong>:浏览器控制台 (F12) 看 JS 报错,大概率是缓存问题 → 强制刷新 Ctrl+Shift+R</li>
        <li>如果<strong>页面白屏</strong>:同上 Ctrl+Shift+R 强制清缓存</li>
        <li>如果<strong>导出后下载是 JSON 文本</strong>:Vite 旧 mock 拦截,后端已修,需 Ctrl+Shift+R 拉新 vite 配置</li>
      </ol>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Refresh, Delete, Download, DataAnalysis, Cpu, Link, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SectionCard from '@/components/SectionCard.vue'
import { useAuthStore } from '@/stores/auth'
import { exportExcel } from '@/utils/exporter'

const auth = useAuthStore()
const frontendUrl = location.origin
const backendUrl = import.meta.env.VITE_API_BASE || '(走 vite proxy /api → 127.0.0.1:3100)'
const proxyUrl = '/api/v1/* → http://127.0.0.1:3100'
const userInfo = `${auth.user?.realName || '未登录'} (${auth.user?.username || '-'}, role: ${auth.user?.isSuper ? '超管' : (auth.user?.perms?.length || 0) + ' perm'})`
const tokenLast8 = (auth.token || '').slice(-8) || '(空)'
const ua = navigator.userAgent.replace(/^Mozilla\/5\.0 \(/, '').slice(0, 50) + '...'

interface ProbeResult {
  name: string
  url: string
  status: 'ok' | 'fail' | 'pending'
  http: number
  ms: number
  note: string
}

const running = ref(false)
const expRunning = ref(false)
const lastExportResult = ref<{ title: string; type: 'success' | 'warning' | 'error' | 'info'; detail: string } | null>(null)

const probes: { name: string; url: string; expectSize?: number }[] = [
  { name: '后端 /health (免登录)', url: '/health' },
  { name: '后端 /tenants/current', url: '/tenants/current' },
  { name: '后端 /tenants/my', url: '/tenants/my' },
  { name: '后端 /subjects/tree', url: '/subjects/tree' },
  { name: '后端 /expense-claims', url: '/expense-claims?pageSize=1' },
  { name: '后端 /dashboard/summary', url: '/dashboard/summary' },
  { name: '导出:凭证 xlsx', url: '/vouchers?format=xlsx', expectSize: 1000 },
  { name: '导出:科目 xlsx', url: '/subjects/list?format=xlsx', expectSize: 1000 },
  { name: '导出:报销 xlsx', url: '/expense-claims?format=xlsx', expectSize: 500 },
]

const results = ref<ProbeResult[]>(probes.map((p) => ({
  name: p.name, url: p.url, status: 'pending', http: 0, ms: 0,
  note: p.expectSize ? `预期 ≥ ${p.expectSize} bytes` : '',
})))

async function probeOne(p: typeof probes[number], token: string): Promise<ProbeResult> {
  const t0 = performance.now()
  try {
    const resp = await fetch(p.url, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
    const buf = await resp.arrayBuffer()
    const ms = Math.round(performance.now() - t0)
    const size = buf.byteLength
    const note = `${size} bytes${p.expectSize && size < p.expectSize ? ' ← 不应小于预期!' : ''}`
    const first4 = new TextDecoder().decode(new Uint8Array(buf).slice(0, 4))
    const isJson = first4.trim().startsWith('{') || first4.trim().startsWith('[')
    if (isJson) {
      const text = new TextDecoder().decode(buf)
      try {
        const j = JSON.parse(text)
        return { name: p.name, url: p.url, status: resp.ok && j.code === 0 ? 'ok' : 'fail', http: resp.status, ms, note: `${note} · JSON ${j.message || ''}` }
      } catch {
        return { name: p.name, url: p.url, status: 'fail', http: resp.status, ms, note: `${note} · 无法解析 JSON` }
      }
    }
    // 二进制:看是不是 xlsx (BOM+<?xml)
    const isXlsx = first4.includes('\u00ef') && size > 500
    return { name: p.name, url: p.url, status: resp.ok && (p.expectSize ? size >= p.expectSize : size > 10) ? 'ok' : 'fail', http: resp.status, ms, note: `${note}${isXlsx ? ' · ✅ xlsx' : ''}` }
  } catch (err: any) {
    return { name: p.name, url: p.url, status: 'fail', http: 0, ms: Math.round(performance.now() - t0), note: `网络错误: ${err?.message || err}` }
  }
}

async function runAll() {
  running.value = true
  results.value = probes.map((p) => ({ name: p.name, url: p.url, status: 'pending', http: 0, ms: 0, note: '检测中...' }))
  const token = auth.token || localStorage.getItem('fm_token') || ''
  for (let i = 0; i < probes.length; i++) {
    results.value[i] = await probeOne(probes[i], token)
  }
  running.value = false
  const failed = results.value.filter((r) => r.status === 'fail').length
  if (failed === 0) {
    ElMessage.success(`全部 ${probes.length} 项检测通过`)
  } else {
    ElMessage.warning(`${failed}/${probes.length} 项失败,详见下方`)
  }
}

async function testExport() {
  expRunning.value = true
  lastExportResult.value = null
  try {
    // 调通用导出工具(它用 fetch,会把 JSON 错误解析掉)
    await exportExcel({
      url: '/vouchers',
      filename: '健康检查-凭证',
      params: { pageSize: 5 },
      loadingText: '健康检查',
    })
    lastExportResult.value = {
      title: '✅ 导出成功',
      type: 'success',
      detail: '请检查浏览器下载文件夹,找到"健康检查-凭证-YYYY-MM-DD.xlsx"。如果文件 0KB 或空白,可能是浏览器拦截。',
    }
  } catch (err: any) {
    lastExportResult.value = { title: '❌ 导出失败', type: 'error', detail: err?.message || '未知错误' }
  } finally {
    expRunning.value = false
  }
}

function clearCache() {
  localStorage.removeItem('fm_token')
  localStorage.removeItem('fm_user')
  localStorage.removeItem('fm_tenants')
  localStorage.removeItem('fm_tenant_id')
  ElMessage.success('已清除,即将跳到登录页...')
  setTimeout(() => { location.href = '/login' }, 800)
}

onMounted(runAll)
</script>

<style scoped>
.health-page { display: flex; flex-direction: column; gap: 16px; }
.probe-actions { display: flex; gap: 8px; margin-bottom: 12px; }
.remark { font-family: 'SF Mono', Menlo, monospace; font-size: 12px; }
.export-result { margin-top: 12px; }
.checklist { line-height: 1.9; padding-left: 22px; }
</style>
