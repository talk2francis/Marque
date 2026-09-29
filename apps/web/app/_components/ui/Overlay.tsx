'use client'
import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { useFocusTrap } from './useFocusTrap'

/**
 * Drawer, Sheet and Modal. All three portal to <body> (escaping any
 * backdrop-filter ancestor that would trap position: fixed), trap focus, close
 * on Escape and on the scrim, and give focus back on close.
 */

function usePortal() {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => setEl(document.body), [])
  return el
}

export function Drawer({ open, onClose, label, head, children }: { open: boolean; onClose: () => void; label: string; head?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const portal = usePortal()
  useFocusTrap(ref, open, onClose)
  if (!open || !portal) return null
  return createPortal(
    <>
      <div className="overlay-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={label}>
        <div className="drawer-head">
          {head ?? <span className="t-label">{label}</span>}
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>,
    portal,
  )
}

/**
 * Bottom sheet on phones, a right-side panel from 1024 px. `surface="chamber"`
 * drops the sheet into the deep ground: money is moving (principle 5).
 */
export function Sheet({ open, onClose, title, label, footer, surface, size, children }: {
  open: boolean; onClose: () => void; title: ReactNode; label: string; footer?: ReactNode; surface?: 'chamber'
  /** 'wide' for side-by-side content (the compare sheet): up to 1040 px on desktop. */
  size?: 'wide'; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const portal = usePortal()
  useFocusTrap(ref, open, onClose)
  if (!open || !portal) return null
  return createPortal(
    <>
      <div className="overlay-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={size === 'wide' ? 'sheet sheet--wide' : 'sheet'} role="dialog" aria-modal="true" aria-label={label} data-surface={surface}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <IconButton label="Close" onClick={onClose}><X /></IconButton>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </>,
    portal,
  )
}

export function Modal({ open, onClose, title, footer, children }: { open: boolean; onClose: () => void; title: string; footer?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const portal = usePortal()
  useFocusTrap(ref, open, onClose)
  if (!open || !portal) return null
  return createPortal(
    <>
      <div className="overlay-scrim" aria-hidden="true" />
      <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}>
          <div className="modal-head"><h2>{title}</h2><IconButton label="Close" bare onClick={onClose}><X /></IconButton></div>
          <div className="modal-body">{children}</div>
          {footer ? <div className="modal-foot">{footer}</div> : null}
        </div>
      </div>
    </>,
    portal,
  )
}
