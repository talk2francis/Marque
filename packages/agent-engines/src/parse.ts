/**
 * Prompt parsing, shared by every engine.
 *
 * The number pattern is deliberately `\d+(?:\.\d+)?` and NEVER `[\d.]+`. The
 * looser class swallows a sentence-ending period — "restore it to 1.6." parses
 * as "1.6.", which is NaN, which silently became a default. The agent then
 * answered a question nobody asked and PASSED, because the published case
 * happened to use that same default. The grade certified the bug.
 *
 * So: every extractor here returns `null` when it cannot tell, and every caller
 * refuses on null. A silent default is worse than a refusal.
 */

// Allows a thousands separator INSIDE the run of digits: "1,000" reads as 1000,
// but a trailing "," (a list or a sentence) is not swallowed. Still never
// `[\d.]+` — a trailing sentence period must not parse as ".", which once
// turned "restore it to 1.6." into NaN and then a silent default.
const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?)`

export function num(text: string, ...patterns: string[]): number | null {
  for (const p of patterns) {
    const m = text.match(new RegExp(p.replace('%N%', NUMBER), 'i'))
    if (m?.[1] !== undefined) {
      const v = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(v)) return v
    }
  }
  return null
}

export function address(text: string): `0x${string}` | null {
  const m = text.match(/0x[a-fA-F0-9]{40}/)
  return m ? (m[0] as `0x${string}`) : null
}

/** Every address in the prompt, in order, deduplicated case-insensitively. */
export function addresses(text: string): `0x${string}`[] {
  const seen = new Set<string>()
  const out: `0x${string}`[] = []
  for (const m of text.matchAll(/0x[a-fA-F0-9]{40}/g)) {
    const a = m[0] as `0x${string}`
    if (seen.has(a.toLowerCase())) continue
    seen.add(a.toLowerCase())
    out.push(a)
  }
  return out
}

export function blockNumber(text: string): bigint | null {
  const m = text.match(/Block:\s*(\d+)/i) ?? text.match(/\bat block\s+(\d+)/i)
  return m?.[1] ? BigInt(m[1]) : null
}

/** A bare integer identifier, e.g. a V3 position token id. */
export function positionTokenId(text: string): string | null {
  const m =
    text.match(/position\s+NFT\s+id\s*[:#]?\s*(\d{3,})/i)
    ?? text.match(/position\s+(?:#|id\s*)?(\d{3,})/i)
    ?? text.match(/token\s*id\s*[:#]?\s*(\d{3,})/i)
  return m?.[1] ?? null
}

export function boolFlag(text: string, truePattern: string, falsePattern: string): boolean | null {
  if (new RegExp(falsePattern, 'i').test(text)) return false
  if (new RegExp(truePattern, 'i').test(text)) return true
  return null
}

/** A comma-or-and separated list following a phrase, lowercased. */
export function listAfter(text: string, phrase: string): string[] | null {
  // `m` matters: the MCS prompts state constraints as an indented block, one
  // per line, so `$` has to mean end-of-line. Without it this matched to the
  // end of the whole prompt and swallowed every later constraint — and the
  // caller then refused a request that was perfectly well specified.
  const m = text.match(new RegExp(`${phrase}\\s+([a-z0-9 ,]+?)(?:[;.]|$)`, 'im'))
  if (!m?.[1]) return null
  return m[1]
    .split(/,|\band\b/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** BSC public dataseeds keep roughly this many blocks of state; older reads prune. */
export const PUBLIC_STATE_WINDOW = 60n

/**
 * What we can actually do about a block a task asks for.
 *
 *   latest       no block was pinned; reading head is correct.
 *   pinned       the block can be read — from a public node if it is recent, or
 *                from the archive endpoint if one is configured. `source` says
 *                which, so a caller can pick the right client and a manifest can
 *                record it.
 *   unavailable  a block WAS pinned, it is older than the public window, and no
 *                archive endpoint is configured. The only honest moves are to
 *                refuse or to say the answer is for a different block — never to
 *                quietly read head, which is the quiet version of making the
 *                number up. `readableBlock` returning `undefined` for BOTH "no
 *                block" and "too old" was exactly that trap; this replaces it.
 */
export type BlockResolution =
  | { mode: 'latest' }
  | { mode: 'pinned'; block: bigint; source: 'public' | 'archive' }
  | { mode: 'unavailable'; requested: bigint }

export function resolveBlock(
  requested: bigint | null,
  head: bigint,
  opts: { archiveAvailable?: boolean } = {},
): BlockResolution {
  if (requested === null) return { mode: 'latest' }
  // A future block is a task error, not a historical read — let the node reject it.
  if (requested > head || head - requested <= PUBLIC_STATE_WINDOW) {
    return { mode: 'pinned', block: requested, source: 'public' }
  }
  if (opts.archiveAvailable) return { mode: 'pinned', block: requested, source: 'archive' }
  return { mode: 'unavailable', requested }
}
