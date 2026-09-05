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

const NUMBER = String.raw`(\d+(?:\.\d+)?)`

export function num(text: string, ...patterns: string[]): number | null {
  for (const p of patterns) {
    const m = text.match(new RegExp(p.replace('%N%', NUMBER), 'i'))
    if (m?.[1] !== undefined) {
      const v = Number(m[1])
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

/**
 * A block we may actually read.
 *
 * BSC public nodes keep roughly 64 blocks of state on every provider we pool,
 * so a pinned block older than that cannot be read at all. Answering for a
 * DIFFERENT block than the one asked for, without saying so, is the quiet
 * version of making the number up.
 */
export function readableBlock(requested: bigint | null, head: bigint): bigint | undefined {
  if (requested === null) return undefined
  return head - requested <= 60n ? requested : undefined
}
