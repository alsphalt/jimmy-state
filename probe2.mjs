import { chromium } from 'playwright-core'
const BASE = 'https://jimmy-state.vercel.app'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const problems = []
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console @${page.url().replace(BASE,'')}: ${m.text().slice(0,200)}`) })
page.on('pageerror', (e) => problems.push(`pageerror @${page.url().replace(BASE,'')}: ${e.message.slice(0,200)}`))
page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) problems.push(`http ${r.status()}: ${r.url().replace(BASE,'')}`) })

for (const route of ['/', '/identify', '/discover', '/videos', '/search?q=faded', '/settings', '/library', '/privacy']) {
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => problems.push(`goto ${route}: ${e.message.slice(0,80)}`))
  await page.waitForTimeout(800)
  const theme = await page.evaluate(() => document.documentElement.dataset.theme)
  const len = await page.evaluate(() => document.getElementById('root')?.innerHTML.length || 0)
  console.log(`[${route}] theme=${theme} root=${len}b`)
}

// theme boot must apply a stored preference before paint
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.setItem('jimmy-state:theme', 'light'))
await page.reload({ waitUntil: 'domcontentloaded' })
const applied = await page.evaluate(() => document.documentElement.dataset.theme)
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
console.log(`stored light theme -> data-theme=${applied}, body bg=${bg}`)
await page.screenshot({ path: 'light-home.png', fullPage: false })
await page.goto(BASE + '/settings', { waitUntil: 'networkidle' })
await page.screenshot({ path: 'light-settings.png' })

console.log('\n===== problems =====')
console.log([...new Set(problems)].join('\n') || '(none)')
await browser.close()
