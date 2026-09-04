/**
 * Parsing untrusted agent output.
 *
 * Agents return JSON wrapped in prose, in fenced code blocks, inside JSON-RPC
 * envelopes, inside A2A artifact arrays, or as a stringified string. All of
 * these are the agent behaving reasonably; none of them are what the schema
 * says. Being strict here would score honest agents as broken.
 *
 * Being permissive about SHAPE is not the same as being permissive about
 * CONTENT. Nothing here coerces a missing value into a present one — an absent
 * field stays absent, and the grader fails it.
 */

/** Pull the first JSON object out of a response, whatever it is wrapped in. */
export function extractJson(body: unknown, depth = 0): unknown {
  if (depth > 6 || body === null || body === undefined) return null

  if (typeof body === 'object') {
    const rec = body as Record<string, unknown>

    // JSON-RPC envelope. An error envelope is an answer about failure, not an
    // answer, so it is not unwrapped into a result.
    if ('error' in rec && rec['error'] !== null && !('result' in rec)) return null
    if ('result' in rec) return extractJson(rec['result'], depth + 1)

    // A2A task shapes: the answer hides in artifacts/parts/messages.
    for (const key of ['artifacts', 'parts', 'messages', 'content']) {
      const arr = rec[key]
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const found = extractJson(item, depth + 1)
          if (found && typeof found === 'object') return found
        }
      }
    }
    if (typeof rec['text'] === 'string') return extractJson(rec['text'], depth + 1)

    // A bare object with no envelope is the answer itself.
    return rec
  }

  if (typeof body === 'string') {
    const trimmed = body.trim()
    // Server-sent events framing.
    if (trimmed.startsWith('data:')) {
      const line = trimmed.split('\n').find((l) => l.startsWith('data:'))
      if (line) return extractJson(line.slice(5).trim(), depth + 1)
    }
    // Fenced code block, with or without a language tag.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    const candidate = fenced?.[1] ?? trimmed
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return extractJson(JSON.parse(candidate.slice(start, end + 1)), depth + 1)
      } catch {
        return null
      }
    }
    return null
  }

  return null
}

/** A USD fee an agent stated, when it stated one we can read. Never guessed. */
export function parseFeeUsd(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  for (const key of ['feeUsd', 'priceUsd', 'costUsd', 'fee', 'price', 'cost']) {
    const v = rec[key]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/[$,\s]/g, ''))
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return null
}

/**
 * A price string from a payment challenge, e.g. "$0.10", "0.10 USDC".
 * Returns both the number and the asset, because assuming the asset is how
 * people end up funding the wrong token (AGENTS.md gotcha 13).
 */
export function parsePriceWithAsset(raw: string | null | undefined): { amount: number; asset: string | null } | null {
  if (!raw) return null
  const text = raw.trim()
  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/)
  if (!amountMatch?.[1]) return null
  const amount = Number(amountMatch[1].replace(',', '.'))
  if (!Number.isFinite(amount)) return null

  const assetMatch = text.match(/\b(USDC|USDT|USD₮0|BUSD|DAI|BNB|WBNB|CAKE|USD)\b/i)
  const asset = assetMatch?.[1] ? assetMatch[1].toUpperCase() : text.includes('$') ? 'USD' : null
  return { amount, asset }
}
