/**
 * Accessibility pass (DESIGN-SYSTEM.md section 12): axe-core on key routes, both themes.
 *
 *   node scripts/axe.mjs [--base=http://127.0.0.1:3299] [--routes=/,/register] [--out=file.json]
 *
 * Fails (exit 1) on any serious or critical violation. Moderate and minor are listed.
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const BASE = args.base ?? 'https://marque.trade'
const ROUTES = String(args.routes ?? '/,/register,/agents/keel,/protocol,/status').split(',')
const THEMES = ['night', 'day']

const browser = await chromium.launch()
const report = []
let blocking = 0
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript((t) => { try { localStorage.setItem('marque-theme', t) } catch { /* storage refused in this context */ } }, theme)
  const page = await ctx.newPage()
  for (const r of ROUTES) {
    await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const v = res.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, help: x.help, targets: x.nodes.slice(0, 4).map((n) => n.target.join(' ')) }))
    const serious = v.filter((x) => x.impact === 'serious' || x.impact === 'critical')
    blocking += serious.length
    report.push({ route: r, theme, passes: res.passes.length, violations: v })
    console.log(`${theme.padEnd(5)} ${r.padEnd(24)} passes ${String(res.passes.length).padStart(3)}  serious/critical ${serious.length}  other ${v.length - serious.length}`)
    for (const x of v) console.log(`        ${x.impact}: ${x.id} (${x.nodes}) ${x.help}\n          ${x.targets.join('\n          ')}`)
  }
  await ctx.close()
}
await browser.close()
if (args.out) writeFileSync(args.out, JSON.stringify({ base: BASE, at: new Date().toISOString(), report }, null, 2))
process.exit(blocking ? 1 : 0)
