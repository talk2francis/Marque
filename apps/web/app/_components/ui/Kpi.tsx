import type { ReactNode } from 'react'
import { ProvenanceChip, type Provenance } from '@marque/ui'

/** Label, value, unit and its source. Never a number without provenance (invariant 5). */
export function Kpi({ label, value, unit, provenance, delta, deltaTone, missing = 'Not measured yet' }: {
  label: string; value: string | null; unit?: string; provenance: Provenance
  delta?: ReactNode; deltaTone?: 'up' | 'down'; missing?: string
}) {
  return (
    <div className="kpi">
      <span className="t-label">{label}</span>
      <span className="kpi-value">
        {value === null ? <span className="kpi-missing">{missing}</span> : <span className="kpi-num">{value}</span>}
        {value !== null && unit ? <span className="kpi-unit">{unit}</span> : null}
        <ProvenanceChip provenance={provenance} />
      </span>
      {delta ? <span className="kpi-delta" data-tone={deltaTone}>{delta}</span> : null}
    </div>
  )
}
