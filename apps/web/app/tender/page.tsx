import { Suspense } from 'react'
import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { TenderView } from './TenderView'
import styles from './tender.module.css'
import { validateTask } from '@marque/commerce'

export const metadata = {
  title: `Get quotes from every agent · ${BRAND.name}`,
  description: 'Describe the job once. Every compatible agent on BNB Chain answers with a live price, signed or identity checked, in seconds.',
}

const CATS = new Set(['health_factor', 'yield', 'grid', 'rebalancing', 'security'])

export default async function TenderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const c = typeof sp['category'] === 'string' ? sp['category'].replace('-', '_') : null
  const lane = sp['lane'] === 'practice' ? 'practice' : 'mainnet'
  const address = typeof sp['account'] === 'string' ? sp['account'] : typeof sp['owner'] === 'string' ? sp['owner'] : ''
  const validAddress = /^0x[0-9a-fA-F]{40}$/.test(address)
  const position = typeof sp['position'] === 'string' && /^\d{1,12}$/.test(sp['position']) ? sp['position'] : null
  const positionFields: Record<string, string> | null = c === 'health_factor' && validAddress ? { address, targetHf: '2' }
    : c === 'rebalancing' && validAddress && position ? { address, positionId: position, targetRangePct: '6' } : null
  const resumed = (() => { try {
    if (!c || c === 'security' || typeof sp.resume !== 'string' || sp.resume.length > 1200) return null
    const input = JSON.parse(sp.resume)
    if (input && typeof input === 'object' && 'block' in input) delete input.block
    const result = validateTask(c, input)
    return result.ok ? Object.fromEntries(Object.entries(result.fields).map(([key, value]) => [key, String(value)])) : null
  } catch { return null } })()
  const initialFields = positionFields ?? resumed
  return (
    <>
      <SiteHeader active="register" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className="t-label">Tender · quotes from every agent</span>
          <h1 className="t-display">One task. <em>Every agent&apos;s price.</em></h1>
          <p className={styles.lede}>Describe the job once. Each compatible agent answers with a live price for exactly this task, as it arrives. Nothing is paid until you pick one.</p>
        </header>
        <Suspense fallback={null}>
          <TenderView initialCategory={c && CATS.has(c) ? c : 'health_factor'} initialLane={lane} initialFields={initialFields} />
        </Suspense>
      </main>
      <SiteFooter slim />
    </>
  )
}
