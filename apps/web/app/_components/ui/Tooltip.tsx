'use client'
import { useId, useState, type ReactNode } from 'react'

/** Shows on hover and on keyboard focus, tied to its trigger with aria-describedby; Escape hides it. */
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span
      className="tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open ? <span role="tooltip" id={id} className="tip-body" data-side={side}>{content}</span> : null}
    </span>
  )
}
