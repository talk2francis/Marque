/**
 * The audit loop.
 *
 * Screenshots every route at four widths and checks the things that are easy to
 * break and hard to notice: horizontal overflow, console errors, missing alt
 * text, invisible focus rings, and low-contrast text.
 *
 * AGENTS.md is explicit that every front-end phase ends by running this,
 * LOOKING at the screenshots, and iterating. The checks below catch what a
 * machine can catch; they do not replace looking.
 *
 *   node scripts/audit.mjs                    audit the live site
 *   BASE_URL=http://127.0.0.1:3200 node scripts/audit.mjs
 *   node scripts/audit.mjs --routes /,/register
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'playwright-report')
const BASE = process.env.BASE_URL ?? 'https://marque.trade'

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

const DEFAULT_ROUTES = ['/', '/_ui', '/register', '/register/rebalancing', '/register/grid', '/register/yield', '/register/health-factor', '/standard']

function routes() {
  const arg = process.argv.find((a) => a.startsWith('--routes'))
  if (!arg) return DEFAULT_ROUTES
  const value = arg.includes('=') ? arg.split('=')[1] : process.argv[process.argv.indexOf(arg) + 1]
  return value.split(',').map((r) => r.trim()).filter(Boolean)
}

async function auditRoute(browser, route, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    // A judge with no wallet must be able to use every one of these surfaces,
    // so the audit browser deliberately has no extension and no storage.
    storageState: undefined,
  })
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
  })
  page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)))
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url().slice(0, 120)} — ${req.failure()?.errorText ?? 'failed'}`)
  })

  const url = `${BASE}${route}`
  let status = 0
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })
    status = res?.status() ?? 0
  } catch (err) {
    await context.close()
    return { route, viewport: viewport.name, status: 0, error: String(err).slice(0, 200), issues: ['navigation failed'] }
  }

  // Let one-shot entrance animations settle before capturing.
  await page.waitForTimeout(700)

  const findings = await page.evaluate(() => {
    const out = {
      overflow: null,
      missingAlt: [],
      lowContrast: [],
      tinyTapTargets: [],
      allCapsLabels: [],
    }

    const de = document.documentElement
    if (de.scrollWidth > de.clientWidth + 1) {
      // Name the widest offender, otherwise "there is overflow" is unactionable.
      let worst = null
      let worstRight = de.clientWidth
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > worstRight + 1) {
          worstRight = r.right
          worst = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''}`
        }
      }
      out.overflow = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, worst }
    }

    for (const img of document.querySelectorAll('img')) {
      if (!img.hasAttribute('alt')) out.missingAlt.push(img.src.slice(0, 100))
    }

    const luminance = ([r, g, b]) => {
      const a = [r, g, b].map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
    }
    const parse = (s) => {
      const m = String(s).match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1].split(',').map((x) => parseFloat(x.trim()))
      if (p.length >= 4 && p[3] === 0) return null
      return [p[0], p[1], p[2]]
    }
    const effectiveBg = (el) => {
      let node = el
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor)
        if (bg) return bg
        node = node.parentElement
      }
      return parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255]
    }

    const seen = new Set()
    for (const el of document.querySelectorAll('p, span, a, li, td, th, h1, h2, h3, h4, button, label, div')) {
      const text = (el.textContent ?? '').trim()
      if (!text || text.length < 2) continue
      if (el.children.length > 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
      const fg = parse(cs.color)
      if (!fg) continue
      const bg = effectiveBg(el)
      const l1 = luminance(fg)
      const l2 = luminance(bg)
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
      const ratio = (hi + 0.05) / (lo + 0.05)
      const size = parseFloat(cs.fontSize)
      const bold = parseInt(cs.fontWeight, 10) >= 700
      const large = size >= 24 || (size >= 18.66 && bold)
      const required = large ? 3 : 4.5
      if (ratio < required) {
        const key = `${text.slice(0, 24)}|${cs.color}`
        if (!seen.has(key)) {
          seen.add(key)
          out.lowContrast.push({ text: text.slice(0, 40), ratio: Number(ratio.toFixed(2)), required, size, color: cs.color })
        }
      }

      /**
       * AGENTS.md forbids ALL-CAPS *labels* — the templated-eyebrow tell —
       * except the four provenance chips.
       *
       * It does not forbid capitals that carry meaning, and the first version
       * of this check could not tell the difference: it flagged "724 USDT" and
       * "81,157 USDC/BTCB". Ticker symbols, test ids and hashes are proper
       * nouns, not shouting. Only flag a run of ordinary words set in capitals.
       */
      const PROVENANCE = ['ONCHAIN', 'MEASURED', 'TESTED', 'CLAIMED']
      const trimmed = text.trim()
      const letters = trimmed.replace(/[^A-Za-z]/g, '')
      const isAllCaps = letters.length >= 4 && letters === letters.toUpperCase()
      // A ticker, an id, or a hash: mostly non-letters, or a known identifier.
      const looksLikeIdentifier =
        /\d/.test(trimmed) ||
        /^(MCS|ERC|BEP|BNB|BSC|HF|APR|APY|LP|USD|JSON|API|SSRF|DNS|TLS|HTTP)\b/.test(trimmed) ||
        /^0x[0-9a-fA-F]+/.test(trimmed) ||
        letters.length / Math.max(trimmed.length, 1) < 0.6
      // Two or more capitalised words in a row is the tell we actually want.
      const wordCount = trimmed.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length
      if (isAllCaps && !PROVENANCE.includes(trimmed) && !looksLikeIdentifier && wordCount >= 2) {
        out.allCapsLabels.push(trimmed.slice(0, 40))
      }
    }

    for (const el of document.querySelectorAll('a, button, [role="button"], input, select')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 24 || r.width < 24) {
        out.tinyTapTargets.push(`${el.tagName.toLowerCase()} ${(el.textContent ?? '').trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }

    return out
  })

  // Focus visibility: tab to the first interactive element and confirm the
  // browser is drawing something. A focus ring removed for looks is a
  // keyboard user locked out.
  let focusVisible = null
  try {
    await page.keyboard.press('Tab')
    focusVisible = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return { ok: false, reason: 'nothing focusable' }
      const cs = getComputedStyle(el)
      const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
      const hasShadow = cs.boxShadow !== 'none'
      const hasBorderChange = cs.borderColor !== 'rgba(0, 0, 0, 0)'
      return {
        ok: hasOutline || hasShadow || hasBorderChange,
        tag: el.tagName.toLowerCase(),
        outline: cs.outline,
        boxShadow: cs.boxShadow.slice(0, 60),
      }
    })
  } catch { /* no focusable elements */ }

  const shotDir = join(OUT, 'screens', route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '_'))
  mkdirSync(shotDir, { recursive: true })
  await page.screenshot({ path: join(shotDir, `${viewport.name}.png`), fullPage: true })

  const issues = []
  if (status >= 400) issues.push(`http ${status}`)
  if (findings.overflow) {
    issues.push(`horizontal overflow: ${findings.overflow.scrollWidth}px in ${findings.overflow.clientWidth}px${findings.overflow.worst ? ` (widest: ${findings.overflow.worst})` : ''}`)
  }
  if (consoleErrors.length) issues.push(`${consoleErrors.length} console error(s)`)
  if (pageErrors.length) issues.push(`${pageErrors.length} page error(s)`)
  if (findings.missingAlt.length) issues.push(`${findings.missingAlt.length} image(s) with no alt`)
  if (findings.lowContrast.length) issues.push(`${findings.lowContrast.length} low-contrast text run(s)`)
  if (findings.allCapsLabels.length) issues.push(`${findings.allCapsLabels.length} ALL-CAPS label(s) outside the provenance vocabulary`)
  if (findings.tinyTapTargets.length) issues.push(`${findings.tinyTapTargets.length} tap target(s) under 24px`)
  if (focusVisible && !focusVisible.ok) issues.push(`focus ring not visible on first tab stop (${focusVisible.reason ?? focusVisible.tag})`)

  await context.close()
  return {
    route, viewport: viewport.name, status, issues,
    consoleErrors, pageErrors, failedRequests, focusVisible, ...findings,
  }
}

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch()
  const results = []
  for (const route of routes()) {
    for (const viewport of WIDTHS) {
      const r = await auditRoute(browser, route, viewport)
      results.push(r)
      const mark = r.issues.length === 0 ? 'ok  ' : 'ISSUE'
      console.log(`${mark} ${route.padEnd(28)} ${viewport.name.padEnd(5)} ${r.issues.join(' · ') || 'clean'}`)
    }
  }
  await browser.close()

  writeFileSync(join(OUT, 'audit.json'), JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2))

  const withIssues = results.filter((r) => r.issues.length > 0)
  const lines = ['# Audit report', '', `Base: ${BASE}`, `Ran: ${new Date().toISOString()}`, '',
    `${results.length} route/width combinations · ${withIssues.length} with issues`, '']
  for (const r of withIssues) {
    lines.push(`## ${r.route} @ ${r.viewport}`)
    for (const i of r.issues) lines.push(`- ${i}`)
    if (r.consoleErrors?.length) {
      lines.push('', '```')
      for (const e of r.consoleErrors.slice(0, 5)) lines.push(e)
      lines.push('```')
    }
    if (r.lowContrast?.length) {
      lines.push('', '| text | ratio | required |', '|---|---:|---:|')
      for (const c of r.lowContrast.slice(0, 10)) lines.push(`| ${c.text} | ${c.ratio} | ${c.required} |`)
    }
    lines.push('')
  }
  writeFileSync(join(OUT, 'audit.md'), lines.join('\n'))

  console.log(`\nscreenshots: playwright-report/screens/  ·  report: playwright-report/audit.md`)
  console.log(`${withIssues.length} of ${results.length} combinations have issues`)
  process.exitCode = 0
}

main().catch((err) => { console.error(err); process.exit(1) })
