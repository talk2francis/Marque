'use client'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { readMode, storeMode, THEME_EVENT, type ThemeMode } from '../../../lib/theme'

const OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'night', label: 'Night', Icon: Moon },
  { mode: 'day', label: 'Day', Icon: Sun },
  { mode: 'system', label: 'System', Icon: Monitor },
]

export function useThemeMode(): [ThemeMode | null, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode | null>(null)
  useEffect(() => {
    const sync = () => setMode(readMode())
    sync()
    window.addEventListener(THEME_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(THEME_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return [mode, (m) => { setMode(m); storeMode(m) }]
}

/** Night, Day or System, from a small menu. */
export function ThemeMenu() {
  const [mode, setMode] = useThemeMode()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const Current = (OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[0]!).Icon
  return (
    <div className="theme-menu" ref={ref}>
      <button type="button" className="icon-btn icon-btn--bare" aria-haspopup="menu" aria-expanded={open} aria-label={`Theme: ${mode ?? 'night'}. Change theme`} title="Theme" onClick={() => setOpen((o) => !o)}>
        <Current />
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label="Theme" style={{ minWidth: 180 }}>
          {OPTIONS.map(({ mode: m, label, Icon }) => (
            <button key={m} type="button" role="menuitemradio" aria-checked={m === mode} className="menu-item" onClick={() => { setMode(m); setOpen(false) }}>
              <Icon />{label}{m === mode ? <Check className="menu-check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The same three choices as a segmented control, for the mobile drawer. */
export function ThemeChoices() {
  const [mode, setMode] = useThemeMode()
  return (
    <div className="seg" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ mode: m, label, Icon }) => (
        <button key={m} type="button" role="radio" aria-checked={m === mode} className="seg-btn" onClick={() => setMode(m)}>
          <Icon size={15} aria-hidden="true" />{label}
        </button>
      ))}
    </div>
  )
}
