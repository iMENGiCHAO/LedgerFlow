// 真测:admin 登录 /vouchers 页面,hover 按钮,看 tooltip 渲染
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()

// 1) 拿 token
const loginResp = await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
})
const loginData = await loginResp.json()
const payload = loginData.data
console.log('✓ 拿到 token')

// 2) 注入 localStorage
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.evaluate((p) => {
  localStorage.setItem('fm_token', p.accessToken)
  localStorage.setItem('fm_user', JSON.stringify(p.user))
  localStorage.setItem('fm_tenants', JSON.stringify(p.tenants))
  localStorage.setItem('fm_tenant_id', String(p.currentTenantId))
}, payload)

// 3) 进 /vouchers
console.log('→ 进 /vouchers ...')
const resp = await page.goto('http://127.0.0.1:5173/vouchers', { waitUntil: 'networkidle0', timeout: 15000 })
console.log('  HTTP:', resp.status())
await new Promise((r) => setTimeout(r, 2000))

// 4) 看所有行的操作列
const actionsInfo = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.el-table__row .row-actions'))
  return cells.map((cell, i) => {
    const buttons = Array.from(cell.querySelectorAll('button')).map((b) => ({
      text: b.textContent?.trim().slice(0, 30),
      disabled: b.disabled,
      classList: b.className,
    }))
    return { row: i, buttonCount: buttons.length, buttons }
  })
})
console.log('\n=== 所有行操作列 ===')
console.log(JSON.stringify(actionsInfo, null, 2))

// 5) hover 第一个 action 按钮,看 tooltip
// 先确保没有其他 dropdown 打开
await page.evaluate(() => {
  document.querySelectorAll('.el-select-dropdown, .el-dropdown-menu, .el-popper').forEach((el) => {
    el.style.display = 'none'
  })
})

console.log('\n→ hover 红冲按钮 ...')
// 红冲按钮在 row=1
const hcBtn = await page.$('.el-table__row:nth-child(2) .row-actions button.danger')
if (hcBtn) {
  await page.mouse.move(0, 0)
  await new Promise((r) => setTimeout(r, 200))
  const box = await hcBtn.boundingBox()
  console.log('  红冲按钮 rect:', box)
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
  }
  await new Promise((r) => setTimeout(r, 1500))
  const tooltip = await page.evaluate(() => {
    const popper = document.querySelector('.el-tooltip__popper')
    if (!popper) return { result: 'no tooltip' }
    const style = getComputedStyle(popper)
    return {
      text: popper.textContent?.trim(),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      bg: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      padding: style.padding,
      transform: style.transform,
    }
  })
  console.log('  tooltip:', JSON.stringify(tooltip, null, 2))
}

// 6) 关闭 popper 后截图
await page.evaluate(() => {
  document.querySelectorAll('.el-select-dropdown, .el-dropdown-menu, .el-popper').forEach((el) => {
    el.remove()
  })
})
await page.screenshot({ path: '/tmp/voucher-actions.png', clip: { x: 1200, y: 200, width: 400, height: 400 } })
console.log('\n📸 右侧操作列截图: /tmp/voucher-actions.png')

// 6) 看带 tooltip 的按钮(应: 制单人与审核人不能相同)
const auditBtn = await page.$('.el-table__row .row-actions button[disabled]')
if (auditBtn) {
  console.log('\n→ hover 禁用按钮("审核记账" + tooltip) ...')
  await auditBtn.hover()
  await new Promise((r) => setTimeout(r, 800))
  const tip = await page.evaluate(() => {
    const popper = document.querySelector('.el-tooltip__popper, .el-popper')
    if (!popper) return null
    const style = getComputedStyle(popper)
    return {
      text: popper.textContent?.trim(),
      display: style.display,
      visibility: style.visibility,
      bg: style.backgroundColor,
      color: style.color,
      fontSize: style.fontSize,
      width: popper.getBoundingClientRect().width,
      height: popper.getBoundingClientRect().height,
    }
  })
  console.log('  禁用按钮 tooltip:', JSON.stringify(tip, null, 2))
}

// 7) 截图
await page.screenshot({ path: '/tmp/voucher-hover.png' })
console.log('\n📸 /tmp/voucher-hover.png')

// 8) 抓所有 toast/error
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
if (errs.length) console.log('错误:', errs)

await browser.close()
