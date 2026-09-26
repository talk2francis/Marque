/**
 * A tiny toast store (DESIGN-SYSTEM.md section 6, Toast). Callers pass mapped
 * sentences, never raw library or contract text (invariant 31).
 * Info 4 s, success 6 s, error persists until dismissed.
 */
import { useSyncExternalStore } from 'react'

export type ToastTone = 'info' | 'success' | 'warn' | 'error'
export interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: string | undefined
  href?: string | undefined
  hrefLabel?: string | undefined
  /** Milliseconds on screen, or null to persist. */
  ttl: number | null
}

const TTL: Record<ToastTone, number | null> = { info: 4000, success: 6000, warn: 6000, error: null }
const MAX = 4

let toasts: Toast[] = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number | null }): number {
  const id = next++
  const ttl = t.ttl === undefined ? TTL[t.tone] : t.ttl
  toasts = [...toasts.slice(-(MAX - 1)), { ...t, id, ttl }]
  emit()
  return id
}

export function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

const EMPTY: Toast[] = []
export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => toasts,
    () => EMPTY,
  )
}
