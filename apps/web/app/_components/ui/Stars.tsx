'use client'
import { Star } from 'lucide-react'
import { useId, useState } from 'react'

/** Average rating with its count, from verified buyers only (ERC-8004 feedback bound to a paid job). */
/** `mine` shows one rating as "4 of 5" instead of an average. */
export function Stars({ value, count, label = 'verified buyers', mine }: { value: number | null; count: number; label?: string; mine?: boolean }) {
  if (value === null || count === 0) return <span className="stars">No ratings yet</span>
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  const five = [0, 1, 2, 3, 4]
  return (
    <span className="stars" aria-label={mine ? `Rated ${Math.round(value)} out of 5` : `Rated ${value.toFixed(1)} out of 5 by ${count} ${label}`}>
      <span className="stars-row" aria-hidden="true">
        {five.map((i) => <Star key={i} fill="currentColor" strokeWidth={0} />)}
        <span className="stars-fill" style={{ width: `${pct}%` }}>
          {five.map((i) => <Star key={i} fill="currentColor" strokeWidth={0} />)}
        </span>
      </span>
      {mine
        ? <span><span className="stars-avg">{Math.round(value)}</span> of 5</span>
        : <span><span className="stars-avg">{value.toFixed(1)}</span> ({count} {label})</span>}
    </span>
  )
}

/** A 1 to 5 picker: a real radio group, so arrow keys and screen readers work. */
export function StarInput({ value, onChange, legend = 'Your rating', disabled }: { value: number | null; onChange: (v: number) => void; legend?: string; disabled?: boolean }) {
  const name = useId()
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <fieldset className="stars-input" disabled={disabled} onMouseLeave={() => setHover(null)}>
      <legend>{legend}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} data-on={n <= shown} onMouseEnter={() => setHover(n)}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n} of 5`} />
          <Star fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </label>
      ))}
    </fieldset>
  )
}
