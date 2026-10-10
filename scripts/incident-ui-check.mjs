/** Read-only candidate checks; never connects a wallet or sends a transaction. */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3299'
const out = 'docs/phase2/screens/incident-2026-10-09'
mkdirSync(out, { recursive: true })
const ids = [341553,341556,341555].map(n=>`56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:${n}`)
let browser
const report = []
try {
  for (const theme of (process.env.THEMES ?? 'night,day').split(',')) for (const width of (process.env.WIDTHS ?? '390,768,1440').split(',').map(Number)) {
    // Release browser resources between viewport batches on the shared VPS.
    browser = await chromium.launch()
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'})
    await context.addInitScript(t=>localStorage.setItem('marque-theme',t),theme)
    const page = await context.newPage()
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text())})
    const capture = async name => {
      await page.evaluate(()=>document.fonts.ready)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`${name}: document overflow`)
      await page.screenshot({path:`${out}/${name}-${width}-${theme}.png`,fullPage:true})
      await page.screenshot({path:`${out}/${name}-${width}-${theme}-viewport.png`})
      const result = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()
      const violations=result.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))
      report.push({name,width,theme,violations,errors:[...errors]})
      writeFileSync(`${out}/checks-${width}-${theme}.json`,JSON.stringify(report.filter(r=>r.width===width && r.theme===theme),null,2))
      console.log(JSON.stringify(report.at(-1)))
      assert.equal(violations.length,0,`${name}: accessibility violations`)
      assert.equal(errors.length,0,`${name}: browser errors`)
    }
    await page.goto(`${base}/agents/56/341556`,{waitUntil:'domcontentloaded',timeout:90000})
    await page.getByRole('tab',{name:'Activity',exact:true}).click()
    await page.getByRole('heading',{name:'The work, wallet by wallet.'}).waitFor()
    await page.getByRole('tab',{name:'Activity',exact:true}).scrollIntoViewIfNeeded()
    await capture('activity')
    await page.getByRole('link',{name:/^Job \d+$/}).first().scrollIntoViewIfNeeded()
    await page.screenshot({path:`${out}/activity-jobs-${width}-${theme}-viewport.png`})
    await page.getByRole('tab',{name:'Activity',exact:true}).press('ArrowLeft')
    assert.equal(await page.getByRole('tab',{name:'Overview',exact:true}).getAttribute('aria-selected'),'true')
    for(const count of [2,3]) {
      await page.goto(`${base}/compare?agents=${encodeURIComponent(ids.slice(0,count).join(','))}`,{waitUntil:'domcontentloaded',timeout:90000})
      const table=page.getByRole('table',{name:'Agent characteristics'})
      await table.waitFor()
      const cells=table.getByRole('row').nth(1).getByRole('cell')
      assert.equal(await cells.count(),count)
      const boxes=await cells.evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,left:n.getBoundingClientRect().left})))
      assert.ok(boxes.every(b=>Math.abs(b.top-boxes[0].top)<2),'comparison values must align horizontally')
      assert.ok(boxes[1].left>boxes[0].left,'agent columns must remain side by side')
      const overflow = await table.evaluate(el => {
        const cells = [...el.querySelectorAll('[role="cell"], [role="columnheader"]')]
        return cells.some(cell => cell.scrollWidth > cell.clientWidth + 2)
      })
      assert.equal(overflow, false, 'badges and values must fit within their agent column')
      await capture(`compare-${count}`)
      if(count===3 && width===390) {
        await page.getByRole('region',{name:'Scrollable agent comparison'}).evaluate(el=>{el.scrollLeft=el.scrollWidth})
        await page.screenshot({path:`${out}/compare-3-swiped-${width}-${theme}-viewport.png`})
      }
      if(count===2 && width===390 && theme==='night') {
        await table.getByRole('link',{name:'Bound',exact:true}).click()
        await page.waitForURL('**/agents/bound')
        await page.getByRole('tab',{name:'Overview',exact:true}).waitFor()
      }
    }
    await page.goto(`${base}/register`,{waitUntil:'domcontentloaded',timeout:90000})
    const toggles=page.getByRole('checkbox')
    await toggles.nth(0).click(); await toggles.nth(1).click()
    await page.getByRole('button',{name:'Compare 2',exact:true}).click()
    await page.getByRole('dialog',{name:'Compare agents'}).waitFor()
    await capture('compare-sheet')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog',{name:'Compare agents'}).waitFor({state:'hidden'})
    await context.close()
    await browser.close()
    browser = undefined
  }
} finally {
  writeFileSync(`${out}/checks.json`,JSON.stringify(report,null,2))
  await browser?.close()
}
