import { notFound } from 'next/navigation'
import { Grain } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { readRun } from '../../../lib/runs'
import { readCharter } from '../../../lib/charters'
import { RunRoom } from './RunRoom'
import styles from './run.module.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The Run Room — cockpit. This is the surface where something is happening.
 *
 * Rendered on the server with whatever has already happened, then handed to the
 * client to keep filling in. That order matters: a run URL shared mid-flight
 * must open with its history intact rather than an empty timeline that fills in
 * a second later, and a run that finished last week must render with no
 * JavaScript at all.
 */
export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await readRun(id)
  if (!view) notFound()

  const charter = view.run.charterId ? await readCharter(view.run.charterId).catch(() => null) : null

  return (
    <>
      <div className={styles.deck} data-surface="cockpit">
        <Grain />
        {/* The header lives inside the cockpit so the surface reads as one
            object rather than a light band sandwiched between two dark ones. */}
        <SiteHeader />
        <main className={styles.page}>
          <RunRoom
            initial={{
              run: JSON.parse(JSON.stringify(view.run)),
              events: JSON.parse(JSON.stringify(view.events)),
              receipt: view.receipt ? { id: view.receipt.id, hash: view.receipt.hash } : null,
            }}
            charter={charter ? {
              id: charter.id,
              status: charter.status,
              agentName: charter.agentName,
              contracts: charter.contracts,
              caps: charter.caps,
              expiresAt: charter.expiresAt,
              grantTxHash: charter.grantTxHash,
              policyHash: charter.policyHash,
              provider: charter.provider,
            } : null}
          />
        </main>
      </div>
      <SiteFooter />
    </>
  )
}
