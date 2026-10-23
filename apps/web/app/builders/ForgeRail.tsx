'use client'
import { useEffect, useState } from 'react'
import styles from './forge.module.css'

/**
 * The Forge progress rail (SPEC-BUILDERS 2): where a builder is, across the three doors. The step in
 * the URL wins; otherwise the furthest step reached on this device. Nothing here is a check: each
 * door's own checks decide whether a step passed.
 */
export const FORGE_STEPS = [
  { id: 'scaffold', label: 'Scaffold', href: '/builders/start' },
  { id: 'strategy', label: 'Strategy', href: '/builders/start#strategy' },
  { id: 'host', label: 'Host', href: '/builders/start#host' },
  { id: 'register', label: 'Register', href: '/builders/register' },
  { id: 'check', label: 'Check', href: '/builders/run' },
  { id: 'listed', label: 'Listed', href: '/builders/run#listed' },
] as const
export type ForgeStep = (typeof FORGE_STEPS)[number]['id']
const KEY = 'marque:forge:v1'

export function markForge(step: ForgeStep, extra: Record<string, string> = {}) {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { step?: ForgeStep }
    const i = FORGE_STEPS.findIndex((s) => s.id === step)
    const j = FORGE_STEPS.findIndex((s) => s.id === cur.step)
    localStorage.setItem(KEY, JSON.stringify({ ...cur, ...extra, step: i > j ? step : cur.step ?? step }))
  } catch { /* private mode: the rail just starts fresh */ }
}

export function ForgeRail({ at }: { at?: ForgeStep }) {
  const [reached, setReached] = useState<ForgeStep | null>(null)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('step') as ForgeStep | null
    let saved: ForgeStep | null = null
    try { saved = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { step?: ForgeStep }).step ?? null } catch { /* none */ }
    setReached(fromUrl && FORGE_STEPS.some((s) => s.id === fromUrl) ? fromUrl : saved)
  }, [])
  const doneUpTo = reached ? FORGE_STEPS.findIndex((s) => s.id === reached) : -1
  return (
    <nav className={styles.rail} aria-label="Forge progress">
      <ol>
        {FORGE_STEPS.map((s, i) => (
          <li key={s.id} data-done={i < doneUpTo || undefined} data-reached={i === doneUpTo || undefined} data-here={s.id === at || undefined}>
            <a href={s.href} aria-current={s.id === at ? 'step' : undefined}><span className={styles.railDot} aria-hidden="true" />{s.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
