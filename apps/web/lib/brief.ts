/**
 * A brief carried from /positions to the hire sheet (SPEC-ADOPTION 1.2). Kept for this tab
 * only (sessionStorage, 30 min), always visible and editable before anything is sent, and
 * never sent anywhere by itself: the hire sheet turns it into the task text a buyer reviews.
 * Storage can be refused (private windows); every read and write is guarded.
 */
export type Brief =
  | { category: 'health_factor'; address: string; targetHf: number }
  | { category: 'rebalancing'; positionId: string; address?: string }
  | { category: 'yield'; asset: string; amount: number }
  | { category: 'grid'; pair: string; capitalUsd: number }

const KEY = 'marque-brief'
const TTL_MS = 30 * 60_000

export function saveBrief(b: Brief): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...b, at: Date.now() })) } catch { /* storage refused: the form still works empty */ }
}

export function readBrief(category?: string | null): Brief | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const b = JSON.parse(raw) as Brief & { at?: number }
    if (!b || typeof b !== 'object' || typeof b.at !== 'number' || Date.now() - b.at > TTL_MS) return null
    if (category && b.category !== category) return null
    return b
  } catch { return null }
}

export function clearBrief(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** The brief in one plain line, as the banner and the hire sheet show it. */
export function briefWords(b: Brief): string {
  switch (b.category) {
    case 'health_factor': return `Health factor check of ${short(b.address)}, target ${b.targetHf.toFixed(2)}`
    case 'rebalancing': return `Re-centre plan for PancakeSwap V3 position #${b.positionId}`
    case 'yield': return `Best net yield for ${b.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${b.asset}`
    case 'grid': return `Grid plan for ${b.pair}/USDT with ${Math.round(b.capitalUsd).toLocaleString('en-US')} USD`
  }
}

/** Where a brief goes: the Tender for its category, which asks every compatible agent at once (SPEC-ADOPTION 1.2). */
export function briefHref(b: Brief): string {
  return `/tender?category=${b.category}&brief=1`
}
