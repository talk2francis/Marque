import type { ReactNode } from 'react'

/** Hairline, crosshair at the left end, label left, annotation right, heading below (section 5). */
export function SectionHead({ label, note, title, lede, id, as: As = 'h2' }: {
  label: string; note?: ReactNode; title?: ReactNode; lede?: ReactNode; id?: string; as?: 'h2' | 'h3'
}) {
  return (
    <div className="section-head" id={id}>
      <span className="cross" aria-hidden="true" />
      <div className="section-head-row">
        <span className="t-label">{label}</span>
        {note ? <span className="section-head-note">{note}</span> : null}
      </div>
      {title ? <As>{title}</As> : null}
      {lede ? <p className="section-head-lede">{lede}</p> : null}
    </div>
  )
}
