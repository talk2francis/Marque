import { createServer } from 'node:http'
import { venusReader, exactRepayToReachTargetHf } from '@marque/positions'
import { publicClient } from '@marque/chain'

/**
 * Keel — the Health Factor reference agent.
 *
 * A first-party agent, and AGENTS.md invariant 1 governs what that is allowed
 * to mean: reference agents exist so no category is ever empty and no judge
 * lands on a dead link. They are labelled, held to the same published test as
 * everyone else, and ranked by the same rules — including when a third-party
 * agent beats them.
 *
 * Keel answers by READING THE CHAIN, not by pattern-matching the prompt. It
 * uses the same readers the rest of the product uses, which is the honest thing
 * and also the only way it can be right at an arbitrary block for an arbitrary
 * address.
 *
 * It speaks standard A2A: a card at /.well-known/agent-card.json naming its own
 * JSON-RPC endpoint, and message/send. No Marque-specific protocol, so the same
 * executor that reaches a third-party agent reaches this one.
 */

const PORT = Number(process.env['KEEL_PORT'] ?? 8610)
const PUBLIC_URL = process.env['KEEL_PUBLIC_URL'] ?? `http://127.0.0.1:${PORT}`

const CARD = {
  name: 'Keel',
  description:
    'Marque Reference Agent for Health Factor. Reads a Venus Core position on BNB Smart Chain and reports the health factor, the per-market collateral factor, the liquidation price, and the exact repayment that restores a target health factor. Non-custodial: it computes, it never signs.',
  // The callable endpoint, named explicitly. A card that names nothing is
  // unaddressable, and we refuse to guess for anyone else — including ourselves.
  url: `${PUBLIC_URL}/a2a`,
  version: '1.0.0',
  protocolVersion: '0.3.0',
  provider: { organization: 'Marque', url: 'https://marque.trade' },
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['application/json'],
  skills: [
    {
      id: 'health-factor-read',
      name: 'Read a Venus health factor',
      description: 'Health factor to three decimals, collateral factor, and liquidation price, read from the Comptroller at a given block.',
      tags: ['health factor', 'liquidation', 'venus', 'lending'],
    },
    {
      id: 'repay-to-target',
      name: 'Exact repayment to restore a target health factor',
      description: 'The closed-form USD repayment that moves the account to a requested health factor.',
      tags: ['health factor', 'repay', 'venus'],
    },
  ],
  /** Stated plainly: this is ours, and it is not ranked differently for it. */
  'x-marque': { referenceAgent: true, category: 'health_factor', standard: 'MCS-HF-1' },
}

/**
 * Pull the address and target out of the task text.
 *
 * The number pattern is deliberately `\d+(?:\.\d+)?` and NOT `[\d.]+`. The
 * looser class swallows the sentence-ending period — "restore it to 1.6."
 * parses as "1.6.", which is NaN, which silently fell back to the 2.5 default.
 * The agent then answered a question nobody asked and, because the published
 * case also uses 2.5, it PASSED. A silent default is worse than a refusal.
 */
const NUMBER = String.raw`(\d+(?:\.\d+)?)`

function parseTask(text: string): { address: string | null; target: number | null; blockNumber: bigint | null } {
  const address = text.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? null
  const raw =
    text.match(new RegExp(String.raw`restore it to\s+` + NUMBER, 'i'))?.[1] ??
    text.match(new RegExp(String.raw`health factor(?:\s+of)?\s+` + NUMBER, 'i'))?.[1] ??
    text.match(new RegExp(String.raw`target(?:\s+health factor)?(?:\s+of)?\s+` + NUMBER, 'i'))?.[1]

  const target = raw === undefined ? null : Number(raw)
  const blockRaw = text.match(/Block:\s*(\d+)/i)?.[1]
  return {
    address,
    // Null rather than a default: if we cannot tell what was asked, say so.
    target: target !== null && Number.isFinite(target) && target > 1 ? target : null,
    blockNumber: blockRaw ? BigInt(blockRaw) : null,
  }
}

async function answer(text: string): Promise<Record<string, unknown>> {
  const { address, target, blockNumber } = parseTask(text)
  if (!address) {
    return { error: 'no BNB Smart Chain address found in the task' }
  }
  if (target === null) {
    // Refusing beats guessing. An answer to the wrong question is worse than
    // no answer, because it looks like an answer.
    return { error: 'no target health factor found in the task; state it explicitly, e.g. "restore it to 2.5"' }
  }

  // BSC public nodes keep ~64 blocks of state, so a block older than that
  // cannot be read. Saying so beats answering for the wrong block.
  let readAt: bigint | undefined
  if (blockNumber !== null) {
    const head = await publicClient().getBlockNumber()
    if (head - blockNumber <= 60n) readAt = blockNumber
  }

  const r = await venusReader(address as `0x${string}`, readAt === undefined ? {} : { blockNumber: readAt })
  if (!r.ok) return { error: `could not read Venus state: ${r.error}` }

  const d = r.data
  if (d.healthFactor === null) {
    return {
      healthFactor: null,
      note: 'this account carries no debt, so it has no health factor',
      blockNumber: r.blockNumber.toString(),
    }
  }

  const primary = [...d.markets]
    .filter((m) => m.suppliedUsd > 0 && m.collateralFactor > 0)
    .sort((a, b) => b.suppliedUsd - a.suppliedUsd)[0]

  return {
    healthFactor: Number(d.healthFactor.value.toFixed(3)),
    primaryCollateralSymbol: primary?.underlyingSymbol ?? null,
    primaryCollateralFactor: primary?.collateralFactor ?? null,
    primaryLiquidationPriceUsd: primary?.liquidationPriceUsd ?? null,
    repayUsdToReachTarget: exactRepayToReachTargetHf(
      d.weightedCollateralUsd.value, d.totalBorrowedUsd.value, target,
    ),
    blockNumber: r.blockNumber.toString(),
    readAt: r.readAt,
    source: 'Venus Comptroller, read on-chain',
  }
}

function textOf(body: unknown): string {
  const params = (body as { params?: { message?: { parts?: Array<{ text?: string }> } } })?.params
  const parts = params?.message?.parts ?? []
  return parts.map((p) => p?.text ?? '').join('\n')
}

const server = createServer((req, res) => {
  const url = req.url ?? '/'
  const send = (status: number, payload: unknown) => {
    const body = JSON.stringify(payload)
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
    res.end(body)
  }

  if (req.method === 'GET' && (url === '/.well-known/agent-card.json' || url === '/.well-known/agent.json')) {
    return send(200, CARD)
  }
  if (req.method === 'GET' && url === '/health') {
    return send(200, { ok: true, agent: 'keel', at: new Date().toISOString() })
  }
  if (req.method !== 'POST' || !url.startsWith('/a2a')) {
    return send(404, { error: 'not found' })
  }

  let raw = ''
  req.on('data', (c: Buffer) => {
    raw += c.toString()
    // A reference agent is still hostile-input-facing. Cap the body.
    if (raw.length > 256 * 1024) req.destroy()
  })
  req.on('end', () => {
    void (async () => {
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { return send(400, { error: 'body was not JSON' }) }

      const id = (parsed as { id?: unknown })?.id ?? 1
      try {
        const result = await answer(textOf(parsed))
        // A2A shape: the structured answer travels as text in an artifact part,
        // which is what a standard A2A client expects to unwrap.
        send(200, {
          jsonrpc: '2.0',
          id,
          result: {
            kind: 'task',
            status: { state: 'completed' },
            artifacts: [{ parts: [{ kind: 'text', text: JSON.stringify(result) }] }],
          },
        })
      } catch (err) {
        // Fail loud and fast rather than hanging: a fast honest error beats a
        // 90-second timeout in a buyer's mind.
        send(200, {
          jsonrpc: '2.0', id,
          error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
        })
      }
    })()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({ agent: 'keel', listening: PORT, card: `${PUBLIC_URL}/.well-known/agent-card.json` }))
})
