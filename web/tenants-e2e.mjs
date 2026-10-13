// 真实 e2e: 模拟 admin 登录,访问 /system/tenants,看实际渲染
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1400, height: 900 },
})

const page = await browser.newPage()

// 1) 拿 admin 真实 token
const loginResp = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
})
const loginData = await loginResp.json()
if (loginData.code !== 0) {
  console.error('登录失败:', loginData.message)
  process.exit(1)
}
const payload = loginData.data

console.log('✓ 拿到 token 后 6 位:', payload.accessToken.slice(-6))
console.log('  admin isSuper:', payload.user.isSuper)
console.log('  账套数:', payload.tenants.length)

// 2) 注入 localStorage
const url = 'http://127.0.0.1:5173/'
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.evaluate((p) => {
  localStorage.setItem('fm_token', p.accessToken)
  localStorage.setItem('fm_user', JSON.stringify(p.user))
  localStorage.setItem('fm_tenants', JSON.stringify(p.tenants))
  localStorage.setItem('fm_tenant_id', String(p.currentTenantId))
}, payload)

// 3) 访问 /system/tenants
const consoleMessages = []
const pageErrors = []
const requestFails = []
page.on('console', (m) => consoleMessages.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => pageErrors.push(e.message + '\n' + (e.stack || '')))
page.on('requestfailed', (r) => requestFails.push(`${r.method()} ${r.url()} → ${r.failure()?.errorText}`))

console.log('\n→ 访问 /system/tenants ...')
const resp = await page.goto('http://127.0.0.1:5173/system/tenants', { waitUntil: 'networkidle0', timeout: 15000 })
console.log('  HTTP:', resp.status())

// 4) 等内容渲染
await new Promise((r) => setTimeout(r, 2000))

// 5) 看实际 DOM
const dom = await page.evaluate(() => {
  const app = document.getElementById('app')
  return {
    title: document.title,
    appExists: !!app,
    appHTML: app ? app.innerHTML.slice(0, 2000) : null,
    appText: app ? app.innerText.slice(0, 1000) : null,
    currentPath: location.pathname,
    localStorageToken: !!localStorage.getItem('fm_token'),
  }
})

console.log('\n=== 页面 DOM 分析 ===')
console.log('title:', dom.title)
console.log('current path:', dom.currentPath)
console.log('localStorage 有 token:', dom.localStorageToken)
console.log('app 节点存在:', dom.appExists)
console.log('\n=== app.innerText (前 1000 字符) ===')
console.log(dom.appText)

console.log('\n=== 关键关键字匹配 ===')
for (const k of ['tenants-page', '账套管理', '北京智云', 'login-card', 'Error', 'TypeError', 'vite', 'HMR', 'el-table', '已启用', '未启用']) {
  if (dom.appHTML) {
    const c = (dom.appHTML.match(new RegExp(k, 'g')) || []).length
    console.log(`  ${k}: ${c}`)
  }
}

if (pageErrors.length) {
  console.log('\n=== ❌ 页面 JS 错误 ===')
  for (const e of pageErrors) console.log('  ', e)
}
if (consoleMessages.length) {
  console.log('\n=== console 消息 (前 20) ===')
  for (const m of consoleMessages.slice(0, 20)) console.log('  ', m)
}
if (requestFails.length) {
  console.log('\n=== ❌ 请求失败 ===')
  for (const r of requestFails) console.log('  ', r)
}

// 6) 截图
await page.screenshot({ path: '/tmp/tenants-actual.png', fullPage: true })
console.log('\n📸 截图: /tmp/tenants-actual.png')

await browser.close()
