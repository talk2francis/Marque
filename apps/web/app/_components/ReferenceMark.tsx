import Link from 'next/link'
import { Chip } from '@marque/ui'
import { referenceMarkHref } from '../../lib/reference-agents'

/**
 * The visible "Marque reference" mark (P10.5A item 4 / AGENTS.md invariant 1 &
 * 17). Put it wherever a reference agent appears — row, card, profile, compare
 * table, charter picker — so one is never mistaken for third-party supply.
 *
 * "Reference", not "Marque agent": the point of the mark is to disclose that we
 * operate this one to keep the category testable, not to badge it as house
 * inventory a buyer should prefer. It links to the full explanation.
 */
const WHY =
  'Operated by Marque so this category always has a working counterparty. Ranked under the same published standard as third-party agents, including when a third party beats it.'

export function ReferenceMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href={referenceMarkHref}
      title={WHY}
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: 28, textDecoration: 'none' }}
    >
      <Chip tone="watch">{compact ? 'Marque reference' : 'Marque reference agent'}</Chip>
    </Link>
  )
}
