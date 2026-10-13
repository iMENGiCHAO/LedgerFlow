// hover 复测
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()

// 1) 拿 token
const lr = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
})
const ld = await lr.json()
const payload = ld.data

// 2) 注入 localStorage
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.evaluate((p) => {
  localStorage.setItem('fm_token', p.accessToken)
  localStorage.setItem('fm_user', JSON.stringify(p.user))
  localStorage.setItem('fm_tenants', JSON.stringify(p.tenants))
  localStorage.setItem('fm_tenant_id', String(p.currentTenantId))
}, payload)

await page.goto('http://127.0.0.1:5173/vouchers', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 2000))

// 3) hover 第 1 行"审核记账"按钮,看计算样式
const result = await page.evaluate(async () => {
  // 关闭可能的 dropdown
  document.querySelectorAll('.el-select-dropdown, .el-dropdown-menu, .el-popper').forEach((el) => el.remove())
  return null
})

const btn = await page.$('.el-table__row:first-child .row-actions button.success')
if (!btn) {
  console.log('未找到审核记账按钮')
  await browser.close()
  process.exit(1)
}

const beforeStyle = await page.evaluate((b) => {
  const cs = getComputedStyle(b)
  return {
    text: b.textContent?.trim(),
    transform: cs.transform,
    lineHeight: cs.lineHeight,
    height: cs.height,
    display: cs.display,
    alignItems: cs.alignItems,
    padding: cs.padding,
    transition: cs.transition,
  }
}, btn)
console.log('\n=== hover 前样式 ===')
console.log(JSON.stringify(beforeStyle, null, 2))

// hover
const box = await btn.boundingBox()
await page.mouse.move(0, 0)
await new Promise((r) => setTimeout(r, 200))
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
await new Promise((r) => setTimeout(r, 600))

const afterStyle = await page.evaluate((b) => {
  const cs = getComputedStyle(b)
  return {
    transform: cs.transform,
    color: cs.color,
    background: cs.backgroundColor,
    borderColor: cs.borderColor,
  }
}, btn)
console.log('\n=== hover 后样式 ===')
console.log(JSON.stringify(afterStyle, null, 2))

// 截图
await page.screenshot({ path: '/tmp/hover-fixed.png', clip: { x: 1300, y: 600, width: 300, height: 100 } })
console.log('\n📸 /tmp/hover-fixed.png')

// 也截全图
await page.screenshot({ path: '/tmp/hover-full.png' })
console.log('📸 /tmp/hover-full.png')

await browser.close()
