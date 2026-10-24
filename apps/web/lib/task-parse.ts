/**
 * A buyer's sentence to a category's task fields (SPEC-SUPPLY 4 schemas), for clients that send plain words,
 * such as an MCP assistant. Only what the sentence states is read; anything missing is left out so the
 * category's own validation names it ("needs a wallet address"), never guessed.
 */
const ADDR = /0x[0-9a-fA-F]{40}/
const num = (s: string) => Number(s.replace(/,/g, ''))

export function fieldsFromText(category: string, text: string): Record<string, unknown> {
  const t = text.replace(/,(?=\d{3}\b)/g, '')
  const f: Record<string, unknown> = {}
  switch (category) {
    case 'health_factor': {
      const a = t.match(ADDR)?.[0]; if (a) f['address'] = a
      // Numbers only from the words around the address: the first one in a valid target range (above 1, at most 10).
      const words = t.replace(/0x[0-9a-fA-F]+/g, ' ')
      const hf = [...words.matchAll(/(?<![\w.])([0-9]+(?:\.[0-9]+)?)(?![\w.])/g)].map((m) => num(m[1]!)).find((n) => n > 1 && n <= 10)
      if (hf !== undefined) f['targetHf'] = hf
      break
    }
    case 'yield': {
      const m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*(k)?\s*(USDT|USDC|FDUSD|U)\b/i)
      if (m) { f['amount'] = num(m[1]!) * (m[2] ? 1000 : 1); f['asset'] = m[3]!.toUpperCase() }
      const d = t.match(/([0-9]{1,4})\s*(?:days|day|d)\b/i)?.[1]; f['holdingDays'] = d ? Number(d) : 30
      const apr = t.match(/(?:earn|earning|current(?:ly)?)[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)\s*%/i)?.[1]; if (apr) f['currentAprPct'] = num(apr)
      break
    }
    case 'grid': {
      const pair = t.match(/\b(BNB|BTCB|ETH|CAKE)\b/i)?.[1]; if (pair) f['pair'] = pair.toUpperCase()
      const range = t.match(/(?:between|from)\s*\$?([0-9]+(?:\.[0-9]+)?)\s*(?:and|to|-)\s*\$?([0-9]+(?:\.[0-9]+)?)/i)
      if (range) { f['lower'] = num(range[1]!); f['upper'] = num(range[2]!) }
      const cap = t.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:USDT|USD|U)\b/i)?.[1] ?? t.match(/\$([0-9]+(?:\.[0-9]+)?)/)?.[1]; if (cap) f['capitalUsd'] = num(cap)
      const lv = t.match(/([0-9]{1,2})[- ]level/i)?.[1]; if (lv) f['levels'] = Number(lv)
      const stop = t.match(/stop(?: at| below)?\s*\$?([0-9]+(?:\.[0-9]+)?)/i)?.[1]; if (stop) f['stop'] = num(stop)
      if (/geometric/i.test(t)) f['spacing'] = 'geometric'; else if (/arithmetic/i.test(t)) f['spacing'] = 'arithmetic'
      break
    }
    case 'rebalancing': {
      const a = t.match(ADDR)?.[0]; if (a) f['address'] = a
      const id = t.replace(/0x[0-9a-fA-F]+/g, ' ').match(/(?:position|#|id|nft)\s*#?\s*([0-9]{3,12})/i)?.[1]; if (id) f['positionId'] = id
      const pct = t.match(/(?:\+\/-|±|plus or minus)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1]; if (pct && num(pct) > 0 && num(pct) <= 50) f['targetRangePct'] = num(pct)
      break
    }
    case 'security': {
      const a = t.match(ADDR)?.[0]; if (a) f['token'] = a
      break
    }
  }
  return f
}
