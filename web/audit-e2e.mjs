// 全栈审计 e2e: 走遍所有模块
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 200))
})

const loginResp = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
})
const payload = (await loginResp.json()).data

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.evaluate((p) => {
  localStorage.setItem('fm_token', p.accessToken)
  localStorage.setItem('fm_user', JSON.stringify(p.user))
  localStorage.setItem('fm_tenants', JSON.stringify(p.tenants))
  localStorage.setItem('fm_tenant_id', String(p.currentTenantId))
}, payload)

const ROUTES = [
  ['Dashboard', '/'],
  ['凭证列表', '/vouchers'],
  ['录入凭证', '/vouchers/new'],
  ['科目管理', '/base/subjects'],
  ['往来单位', '/base/partners'],
  ['部门项目员工', '/base/org'],
  ['期初建账', '/init-balances'],
  ['期末处理', '/closing'],
  ['应收应付', '/arap'],
  ['发票台账', '/invoices'],
  ['资金管理', '/fund'],
  ['我的报销', '/expense/mine'],
  ['报销审批', '/expense/approve'],
  ['固定资产', '/assets'],
  ['科目余额表', '/reports/balance-summary'],
  ['明细账', '/reports/detail-ledger'],
  ['资产负债表', '/reports/balance-sheet'],
  ['利润表', '/reports/income'],
  ['用户管理', '/system/users'],
  ['角色权限', '/system/roles'],
  ['操作日志', '/system/logs'],
  ['数据备份', '/system/backups'],
  ['系统参数', '/system/params'],
  ['账套管理', '/system/tenants'],
  ['健康检查', '/system/health'],
  ['使用说明', '/help'],
]

const summary = []
for (const [name, route] of ROUTES) {
  const beforeErr = errs.length
  try {
    const resp = await page.goto('http://127.0.0.1:5173' + route, { waitUntil: 'networkidle0', timeout: 12000 })
    await new Promise((r) => setTimeout(r, 1500))
    const state = await page.evaluate(() => {
      const app = document.getElementById('app')
      const hasContent = !!app && app.innerText.length > 100
      const title = app?.querySelector('.page-title, h1, h2')?.textContent?.trim() || ''
      return { hasContent, title, appLen: app?.innerText.length || 0 }
    })
    const newErrs = errs.length - beforeErr
    const status = !state.hasContent ? '❌ 空' : newErrs > 0 ? `⚠️ ${newErrs}错` : '✅'
    summary.push({ name, route, status, ...state, http: resp?.status() })
    console.log(`  ${status}  ${name.padEnd(14)} ${route.padEnd(28)} title="${state.title}" http=${resp?.status()}`)
  } catch (e) {
    summary.push({ name, route, status: '❌ 超时', err: e.message })
    console.log(`  ❌ 超时  ${name}  ${route}: ${e.message.slice(0, 80)}`)
  }
}

console.log('\n=== 总结 ===')
const ok = summary.filter((s) => s.status === '✅').length
const warn = summary.filter((s) => s.status?.includes('⚠️')).length
const bad = summary.filter((s) => s.status?.includes('❌')).length
console.log(`  ✅ 正常: ${ok}/${summary.length}`)
console.log(`  ⚠️ 有错: ${warn}`)
console.log(`  ❌ 失败: ${bad}`)

console.log('\n=== 报错聚合 ===')
const unique = [...new Set(errs)]
for (const e of unique.slice(0, 10)) console.log('  -', e.slice(0, 150))

await browser.close()
