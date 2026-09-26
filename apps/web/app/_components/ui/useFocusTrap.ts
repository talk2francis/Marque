'use client'
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * For an open dialog: move focus inside, keep Tab inside, close on Escape, lock
 * page scroll (without the layout jump of a vanishing scrollbar), and give focus
 * back to whatever opened it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const focusables = () => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement) : [])
    const initial = node?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
    initial?.focus({ preventScroll: true })
    const { body, documentElement } = document
    const prev = { overflow: body.style.overflow, pad: body.style.paddingRight }
    const gap = window.innerWidth - documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (f.length === 0) return
      const first = f[0]!, last = f[f.length - 1]!
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      body.style.overflow = prev.overflow
      body.style.paddingRight = prev.pad
      previous?.focus?.({ preventScroll: true })
    }
  }, [open, onClose, ref])
}
