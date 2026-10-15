// 附件上传真测:编辑页上传 PNG → 列表出现 → attachmentCount 联动 → 下载可用
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'

// 生成 1x1 真实 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6260010000050001' +
  '0d0a2db40000000049454e44ae426082'.replace(/ /g, ''), 'hex')
writeFileSync('/tmp/fm-att-test.png', PNG)

const login = await (await fetch('http://127.0.0.1:3100/api/v1/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
})).json()
const token = login.data.accessToken

// 拿一张凭证 id
const vouchers = await (await fetch('http://127.0.0.1:3100/api/v1/vouchers?page=1&pageSize=5', {
  headers: { Authorization: `Bearer ${token}` },
})).json()
const vid = vouchers.data.list?.[0]?.id ?? vouchers.data.items?.[0]?.id
console.log('目标凭证 id:', vid)
if (!vid) process.exit(1)

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
await page.evaluate((p) => {
  localStorage.setItem('fm_token', p.accessToken)
  localStorage.setItem('fm_user', JSON.stringify(p.user))
  localStorage.setItem('fm_tenants', JSON.stringify(p.tenants))
  localStorage.setItem('fm_tenant_id', String(p.currentTenantId))
}, login.data)
await page.goto(`http://127.0.0.1:5173/vouchers/${vid}/edit`, { waitUntil: 'networkidle0', timeout: 20000 })
await new Promise(r => setTimeout(r, 2000))

// 上传
const fileInput = await page.$('.el-upload input[type="file"]')
if (!fileInput) { console.log('❌ 未找到上传 input'); await browser.close(); process.exit(1) }
await fileInput.uploadFile('/tmp/fm-att-test.png')
await new Promise(r => setTimeout(r, 2500))

const ui = await page.evaluate(() => ({
  items: document.querySelectorAll('.attachment-item').length,
  firstName: document.querySelector('.attachment-item .att-name')?.textContent,
  count: document.querySelector('input[aria-label]') ? null : null,
}))
console.log('UI 附件条目:', ui.items, '文件名:', ui.firstName)
const ok1 = ui.items >= 1 && ui.firstName === 'fm-att-test.png'

// 详情 API 验证
const detail = await (await fetch(`http://127.0.0.1:3100/api/v1/vouchers/${vid}`, {
  headers: { Authorization: `Bearer ${token}` },
})).json()
console.log('后端 attachmentCount:', detail.data.attachmentCount, 'attachments:', detail.data.attachments?.length)
const ok2 = detail.data.attachmentCount >= 1

// 下载 API 验证
const att = detail.data.attachments?.[0]
if (att) {
  const dl = await fetch(`http://127.0.0.1:3100/api/v1/attachments/${att.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const buf = Buffer.from(await dl.arrayBuffer())
  console.log(`下载: HTTP ${dl.status}, ${buf.length} bytes, PNG头: ${buf.subarray(0, 4).toString('hex') === '89504e47' ? '✓' : '✗'}`)
  var ok3 = dl.status === 200 && buf.length > 0
} else var ok3 = false

console.log('运行时错误:', errors.length ? errors : '无')
const all = ok1 && ok2 && ok3 && errors.length === 0
console.log(all ? '\n✅ 附件功能端到端通过' : '\n❌ 附件功能存在问题')
await browser.close()
process.exit(all ? 0 : 1)
