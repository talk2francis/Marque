/**
 * Night, Day and System (DESIGN-SYSTEM.md section 2).
 *
 * The stored choice is the *mode*; `data-theme` on <html> is always the
 * resolved theme, night or day. System resolves from prefers-color-scheme and
 * follows it live. Phase 1 stored `dark` / `light`; both still read correctly.
 */
export type ThemeMode = 'night' | 'day' | 'system'
export type Theme = 'night' | 'day'
export const THEME_KEY = 'marque-theme'
export const THEME_EVENT = 'marque:theme'

export function normaliseMode(raw: string | null | undefined): ThemeMode {
  if (raw === 'day' || raw === 'light') return 'day'
  if (raw === 'system') return 'system'
  return 'night'
}

export function readMode(): ThemeMode {
  try { return normaliseMode(window.localStorage.getItem(THEME_KEY)) } catch { return 'night' }
}

export function resolveTheme(mode: ThemeMode): Theme {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'
}

export function applyMode(mode: ThemeMode): void {
  const root = document.documentElement
  root.setAttribute('data-theme', resolveTheme(mode))
  root.setAttribute('data-theme-mode', mode)
  window.dispatchEvent(new Event(THEME_EVENT))
}

export function storeMode(mode: ThemeMode): void {
  try { window.localStorage.setItem(THEME_KEY, mode) } catch { /* storage refused: the choice lasts this page */ }
  applyMode(mode)
}

/**
 * Inline in <head>, before any stylesheet paints, so the wrong theme never
 * flashes. Dependency-free by necessity. It also keeps System live: when the OS
 * flips, it re-resolves, but only while the page is still in System mode.
 */
export const THEME_BOOTSTRAP = `(function(){var d=document.documentElement,k='${THEME_KEY}';function m(){try{var t=localStorage.getItem(k);if(t==='light')return'day';if(t==='dark')return'night';if(t==='day'||t==='system')return t;}catch(e){}return'night'}function r(x){return x==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'day':'night'):x}var x=m();d.setAttribute('data-theme',r(x));d.setAttribute('data-theme-mode',x);try{matchMedia('(prefers-color-scheme: light)').addEventListener('change',function(){if(d.getAttribute('data-theme-mode')==='system'){d.setAttribute('data-theme',r('system'));window.dispatchEvent(new Event('${THEME_EVENT}'))}})}catch(e){}})();`
