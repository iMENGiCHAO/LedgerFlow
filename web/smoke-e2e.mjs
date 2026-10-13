// Element Plus 按需引入冒烟验证:关键页面组件渲染 + 命令式 API + 表格交互
// 运行前置:后端 :3100 已启动,前端(vite preview/dev) :5173 已启动
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WEB = 'http://127.0.0.1:5173'

let passed = 0, failed = 0
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.log(`  ❌ ${name} ${extra}`) }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

const login = await (await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
})).json()
ok(login.code === 0, '登录接口')

await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate((p) => {
  localStorage.setItem('fm_token', p.accessToken)
  localStorage.setItem('fm_user', JSON.stringify(p.user))
  localStorage.setItem('fm_tenants', JSON.stringify(p.tenants))
  localStorage.setItem('fm_tenant_id', String(p.currentTenantId))
}, login.data)

// —— 1. 看板:echarts 图表渲染 ——
await page.goto(`${WEB}/dashboard`, { waitUntil: 'networkidle0', timeout: 20000 })
await new Promise(r => setTimeout(r, 2500))
const dash = await page.evaluate(() => ({
  charts: document.querySelectorAll('canvas').length,
  cards: document.querySelectorAll('.stat-card, [class*="stat"]').length,
  title: document.title,
}))
ok(dash.charts >= 1, `看板 echarts 图表渲染(${dash.charts} 个 canvas)`)

// —— 2. 凭证页:el-table + el-button + 分页 ——
await page.goto(`${WEB}/vouchers`, { waitUntil: 'networkidle0', timeout: 20000 })
await new Promise(r => setTimeout(r, 2000))
const v = await page.evaluate(() => ({
  table: document.querySelectorAll('.el-table').length,
  rows: document.querySelectorAll('.el-table__row').length,
  headers: [...document.querySelectorAll('.el-table__header th')].map(th => th.textContent?.trim()),
  buttons: document.querySelectorAll('.row-actions button').length,
  pager: document.querySelectorAll('.el-pagination').length,
}))
ok(v.table >= 1, '凭证页 el-table 渲染')
ok(v.rows >= 1, `凭证行数据(${v.rows} 行)`)
ok(v.pager >= 1, 'el-pagination 渲染')

// —— 3. 录入页:el-form + el-select + el-date-picker ——
await page.goto(`${WEB}/vouchers/new`, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {})
await new Promise(r => setTimeout(r, 2000))
const form = await page.evaluate(() => {
  const inputs = document.querySelectorAll('.el-input, .el-input__inner, .el-date-editor').length
  const select = document.querySelectorAll('.el-select').length
  const datePicker = document.querySelectorAll('.el-date-editor').length
  return { inputs, select, datePicker, path: location.pathname }
})
ok(form.path === '/vouchers/new', `路由进入录入页(${form.path})`)
ok(form.inputs >= 3, `el-form/el-input 渲染(${form.inputs} 个)`)

// —— 4. 报表:资产负债表渲染 ——
await page.goto(`${WEB}/reports`, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {})
await new Promise(r => setTimeout(r, 2500))
const rep = await page.evaluate(() => ({
  content: (document.body.textContent || '').includes('资产负债') || (document.body.textContent || '').includes('利润'),
  tables: document.querySelectorAll('table, .el-table').length,
}))
ok(rep.tables >= 1, '报表页表格渲染')

// —— 5. ElMessage 命令式 API(按需样式注入是否生效):空表单提交触发错误提示 ——
await page.goto(`${WEB}/vouchers/new`, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {})
await new Promise(r => setTimeout(r, 1500))
await page.evaluate(() => document.querySelectorAll('button').forEach(b => { if (b.textContent?.includes('保存')) b.click() }))
await new Promise(r => setTimeout(r, 1200))
const msg = await page.evaluate(() => {
  const el = document.querySelector('.el-message')
  return el ? { text: el.textContent, visible: getComputedStyle(el).display !== 'none' } : null
})
ok(!!msg && (msg.text.includes('失败') || msg.text.includes('错误') || msg.text.length > 0), `ElMessage 弹出("${msg?.text ?? '未弹出'}")`)

// —— 6. 控制台错误 ——
ok(errors.length === 0, `无运行时错误${errors.length ? '(' + errors.slice(0, 3).join(' | ') + ')' : ''}`)

console.log(`\n冒烟结果: ${passed}/${passed + failed}`)
await browser.close()
process.exit(failed > 0 ? 1 : 0)
