import Link from 'next/link'
import { Chip } from '@marque/ui'
import { referenceMarkHref } from '../../lib/reference-agents'

/**
 * The visible "Marque reference agent" mark (P10.5A item 4 / AGENTS.md
 * invariant 1 & 17). Put it wherever a reference agent appears — row, profile,
 * compare table, charter picker — so one is never mistaken for third-party
 * supply. It links to the one-line explanation.
 */
export function ReferenceMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href={referenceMarkHref}
      title="Why Marque runs its own agents"
      style={{ display: 'inline-flex', alignItems: 'center', minHeight: 28, textDecoration: 'none' }}
    >
      <Chip tone="watch">{compact ? 'Marque agent' : 'Marque reference agent'}</Chip>
    </Link>
  )
}
