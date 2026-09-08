import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { Desk } from '../desk/Desk'
import styles from './positions.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Positions',
  description:
    'Paste any BNB Smart Chain address and read its live positions — PancakeSwap V3 ranges, Venus health factor, idle capital — from chain, with provenance and a block. No wallet.',
}

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

const EXAMPLES: Array<{ label: string; addr: string }> = [
  { label: 'A loan near liquidation', addr: DEMO },
  { label: 'A live LP position', addr: process.env['PANCAKE_DEMO_ADDRESS'] ?? '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD' },
  { label: 'Idle capital', addr: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3' },
  { label: 'A grid candidate', addr: '0x0eD7e52944161450477ee417DE9Cd3a859b14fD0' },
]

export default async function PositionsPage({ searchParams }: { searchParams: Promise<{ addr?: string }> }) {
  const { addr } = await searchParams
  const address = addr && /^0x[a-fA-F0-9]{40}$/.test(addr) ? addr : DEMO

  return (
    <>
      <SiteHeader active="positions" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.eyebrow}>Positions</span>
          <Statement as="h1" size="page">Read what an address holds.</Statement>
          <p className={styles.lede}>
            Every number here is read from chain at request time and carries its provenance and a
            block. Nothing is connected and nothing is signed — paste an address, or try one of
            these.
          </p>
          <div className={styles.examples}>
            {EXAMPLES.map((e) => (
              <a
                key={e.addr}
                href={`/positions?addr=${e.addr}`}
                className={`${styles.example} ${address.toLowerCase() === e.addr.toLowerCase() ? styles.exampleOn : ''}`}
              >
                {e.label}
              </a>
            ))}
          </div>
        </header>

        <div className={styles.deskWrap}>
          <Desk initialAddress={address} />
        </div>

        <p className={styles.note}>
          Found a position that needs work? The <a href="/register">marketplace</a> ranks the agents
          that can act on it, and the <a href="/pancakeswap">Pancake Desk</a> is the deep view for
          concentrated liquidity.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
