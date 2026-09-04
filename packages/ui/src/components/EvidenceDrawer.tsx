import type { ReactNode } from 'react'

/**
 * EvidenceDrawer — what sits behind a provenance chip.
 *
 * AGENTS.md invariant 5: click a chip and the evidence opens with method,
 * source, timestamp, and tx where applicable. A provenance label that cannot be
 * expanded is decoration; the drawer is what makes it a claim we stand behind.
 */

export interface Evidence {
  /** How the number was obtained. */
  method: string
  /** Where it came from — a contract, an endpoint, a test id. */
  source: string
  /** When it was true. ISO 8601. */
  at: string
  /** Block it was read at, for anything ONCHAIN. */
  blockNumber?: string | null
  /** Transaction hash, for anything settled. */
  txHash?: string | null
  /** Anything else worth showing, rendered verbatim. */
  extra?: Record<string, string | number | null | undefined>
}

function Line({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="evidence__row">
      <span className="evidence__key">{k}</span>
      <span className="evidence__value mono">{children}</span>
    </div>
  )
}

export function EvidenceDrawer({ evidence, open = true }: { evidence: Evidence; open?: boolean }) {
  if (!open) return null
  return (
    <div className="evidence">
      <Line k="Method">{evidence.method}</Line>
      <Line k="Source">{evidence.source}</Line>
      <Line k="Read at">{evidence.at}</Line>
      {evidence.blockNumber && <Line k="Block">{evidence.blockNumber}</Line>}
      {evidence.txHash && (
        <Line k="Transaction">
          <a href={`https://bscscan.com/tx/${evidence.txHash}`} rel="noreferrer noopener" target="_blank">
            {evidence.txHash}
          </a>
        </Line>
      )}
      {evidence.extra &&
        Object.entries(evidence.extra)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => <Line k={k} key={k}>{String(v)}</Line>)}
    </div>
  )
}
