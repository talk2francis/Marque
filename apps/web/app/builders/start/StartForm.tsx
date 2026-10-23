'use client'
import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { ButtonLink } from '../../_components/ui'
import { markForge } from '../ForgeRail'
import styles from '../forge.module.css'

/** Door 3 (SPEC-BUILDERS 6): a deterministic starter for one category, with no working strategy in it. */
const CATS = [
  { v: 'health_factor', label: 'Health factor', test: 'MCS-HF-1', hint: 'Venus health factor, liquidation price and the repay that reaches a target.' },
  { v: 'yield', label: 'Yield', test: 'MCS-YIELD-1', hint: 'Where an amount earns most, net of switching cost, and whether to move.' },
  { v: 'grid', label: 'Grid trading', test: 'MCS-GRID-1', hint: 'Grid levels inside a range, with allocation, stop and fee drag.' },
  { v: 'rebalancing', label: 'Rebalancing', test: 'MCS-REB-1', hint: 'A PancakeSwap V3 position re-centred on valid ticks.' },
] as const

const TREE = ['README.md', 'BUILD_WITH_AI.md', 'DEPLOY.md', 'package.json', '.env.example', 'registration.json', 'src/task.ts', 'src/chain.ts', 'src/card.ts', 'src/seller.ts', 'src/strategy.ts', 'test/mcs.test.ts']

export function StartForm() {
  const [cat, setCat] = useState<(typeof CATS)[number]['v']>('health_factor')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('0.10')
  const ok = name.trim().length >= 2 && desc.trim().length >= 10 && Number(price) > 0
  const href = useMemo(() => `/api/v1/builders/kit?category=${cat}&name=${encodeURIComponent(name.trim())}&description=${encodeURIComponent(desc.trim())}&price=${encodeURIComponent(price)}`, [cat, name, desc, price])
  const c = CATS.find((x) => x.v === cat)!
  return (
    <div className={styles.startGrid}>
      <section className={styles.panel} aria-labelledby="k-title">
        <h2 id="k-title">Generate your starter</h2>
        <div className={styles.catPick} role="radiogroup" aria-label="Category">
          {CATS.map((x) => (
            <button key={x.v} type="button" role="radio" aria-checked={cat === x.v} data-on={cat === x.v || undefined} onClick={() => setCat(x.v)}>
              <b>{x.label}</b><span>{x.hint}</span><code>{x.test}</code>
            </button>
          ))}
        </div>
        <div className={styles.fields}>
          <label>Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Harbour HF" /></label>
          <label>Price per job, U<input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} /></label>
          <label className={styles.wide}>One-line description<input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder={c.hint} /></label>
        </div>
        <div className={styles.actions}>
          {ok ? <a className="btn btn--primary" href={href} download onClick={() => markForge('scaffold')}><Download aria-hidden="true" />Download the starter</a> : <span className={styles.fine}>Name it and describe it to download.</span>}
        </div>
      </section>
      <aside className={styles.tree} aria-label="What is in the starter">
        <p className="t-label">In the zip</p>
        <ul>{TREE.map((t) => <li key={t} data-mine={t === 'src/strategy.ts' || undefined}>{t}{t === 'src/strategy.ts' ? <span> you write this</span> : null}</li>)}</ul>
        <p className={styles.fine}>No working strategy ships. <code>pnpm test:mcs</code> fails until you write <code>analyse</code>: that line keeps every Forge agent original.</p>
        <ButtonLink size="sm" href="/builders/test">Test a live endpoint on the web</ButtonLink>
      </aside>
    </div>
  )
}
