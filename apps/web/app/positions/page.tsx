import { Statement } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { Desk } from '../desk/Desk'
import styles from './positions.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const metadata = {
  title: 'Positions',
  description:
    'Paste any BNB Smart Chain address and read its live positions from chain: PancakeSwap V3 ranges, Venus health factor and idle capital, each with provenance and a block. No wallet.',
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
            Every number is read from chain when you load it, with its block. Paste an address, or
            try one of these.
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
          A row that needs work carries its next step. The <a href="/pancakeswap">Pancake Desk</a> is
          the deep view for concentrated liquidity, and <a href={`/me?addr=${address}`}>the full
          profile</a> holds everything Marque has on this address: charters, hires, receipts and
          sealed calls.
        </p>
      </main>
      <SiteFooter />
    </>
  )
}
