'use client'
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * For an open dialog: move focus inside, keep Tab inside, close on Escape, lock
 * page scroll (without the layout jump of a vanishing scrollbar), and give focus
 * back to whatever opened it.
 *
 * The effect runs once per opening. It used to depend on `onClose`, which callers
 * pass inline, so every re-render of the dialog (a keystroke in a field, a quote
 * countdown) re-ran it and threw focus back to the first button: typing an address
 * into the hire sheet kept only its first character (P2-12 keyboard check). The
 * latest `onClose` is read through a ref, and the node is read when it is needed,
 * so a dialog whose portal mounts a frame later is still focused.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () => {
      const node = ref.current
      return node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement) : []
    }
    let raf = 0
    const focusIn = () => {
      const node = ref.current
      if (!node) { raf = requestAnimationFrame(focusIn); return }
      if (node.contains(document.activeElement)) return
      const initial = node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
      initial?.focus({ preventScroll: true })
    }
    focusIn()
    const { body, documentElement } = document
    const prev = { overflow: body.style.overflow, pad: body.style.paddingRight }
    const gap = window.innerWidth - documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (gap > 0) body.style.paddingRight = `${gap}px`
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (f.length === 0) return
      const first = f[0]!, last = f[f.length - 1]!
      const inside = ref.current?.contains(document.activeElement) ?? false
      if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      body.style.overflow = prev.overflow
      body.style.paddingRight = prev.pad
      if (previous && previous !== document.body && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  }, [open, ref])
}
