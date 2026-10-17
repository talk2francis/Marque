import fs from 'node:fs'
import { createPublicClient, custom, type PublicClient } from 'viem'
import { safeFetch } from '@marque/probe'
import { inspectReceiptBundle, inspectReceiptAnchor, inspectTransaction, verifyReceiptIntegrity } from '../packages/execution/src/index.js'
import { inspectCommerceContent, inspectCommerceBundle } from '../packages/commerce/src/inspection.js'

/** Independent local inspector. No private environment loading, wallet or write RPC. */
async function main() {
  const file = process.argv[2]
  const flags = new Map<string, string>()
  for (let i = 3; i < process.argv.length; i += 2) {
    const name = process.argv[i]!, value = process.argv[i + 1]
    if (!['--rpc', '--anchor-chain', '--anchor-contract', '--artifact', '--expected-receipt-hash'].includes(name) || !value || flags.has(name)) throw new Error('Unsupported or incomplete option')
    flags.set(name, value)
  }
  function local(path: string): Buffer {
    if (!fs.statSync(path).isFile() || fs.statSync(path).size > 2 * 1024 * 1024) throw new Error('Input must be a local file, at most 2 MiB')
    return fs.readFileSync(path)
  }
  if (!file) throw new Error('Usage: node --import tsx scripts/verify-receipt.mts bundle.json [--rpc public-url] [--anchor-chain 56|97] [--anchor-contract address] [--artifact local-file] [--expected-receipt-hash hash]')
  const input: unknown = JSON.parse(local(file).toString('utf8'))
  // Existing published HTTP responses are not silently relabelled as V2 bundles.
  if (input && typeof input === 'object' && !('schema' in input) && 'receipt' in input && 'hash' in input) {
    const check = verifyReceiptIntegrity(input.receipt, input.hash)
    const expected = flags.get('--expected-receipt-hash')
    if (expected && (typeof input.hash !== 'string' || expected.toLowerCase() !== input.hash.toLowerCase())) throw new Error('Independent expected receipt hash differs')
    console.log(JSON.stringify({ format: 'LEGACY_RECEIPT_HTTP_RESPONSE', bundleVersion: null, digest: check, chain: 'UNAVAILABLE_EXPORT_OR_SUPPLY_EXPLICIT_V2_REFERENCE', payment: 'NOT_CHECKED', issuerAuthentication: 'NOT_PROVIDED' }, null, 2))
    process.exitCode = check.status !== 'MATCH' ? 1 : flags.has('--rpc') ? 2 : 0
    return
  }
  const receipt = input !== null && typeof input === 'object' && 'schema' in input && input.schema === 'marque.receipt.bundle.v2'
  const offline = receipt ? inspectReceiptBundle(input) : inspectCommerceContent(input)
  const report: Record<string, unknown> = { offline, scope: 'local content and explicitly supplied read-only RPC; no signatures, task calls, keys or payments' }
  const expectedHash = flags.get('--expected-receipt-hash')
  if (expectedHash && (!/^0x[\da-fA-F]{64}$/.test(expectedHash) || !receipt || !input || typeof input !== 'object' || !('payload' in input) || typeof input.payload !== 'object' || !input.payload || !('receiptHash' in input.payload) || String(input.payload.receiptHash).toLowerCase() !== expectedHash.toLowerCase())) throw new Error('Independent expected receipt hash differs')
  if (offline.integrity !== 'MATCH') { console.log(JSON.stringify(report, null, 2)); process.exitCode = 1; return }
  const url = flags.get('--rpc')
  if (!url) { console.log(JSON.stringify(report, null, 2)); process.exitCode = 0; return }
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Supply one public HTTP(S) RPC without userinfo')
  const allowed = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_call'])
  const deadline = Date.now() + 120_000
  let calls = 0
  const rpc = createPublicClient({ transport: custom({
    async request({ method, params }) {
      if (!allowed.has(method) || ++calls > 128 || Date.now() >= deadline) throw new Error('Read-only RPC method or request budget exceeded')
      const id = calls
      const res = await safeFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? [] }), timeoutMs: Math.min(8000, deadline - Date.now()), maxBytes: 1024 * 1024, maxRedirects: 0 })
      if (!res.ok || res.status !== 200) throw new Error('Independent RPC response unavailable')
      const body: unknown = JSON.parse(res.body)
      if (!body || typeof body !== 'object' || !('id' in body) || body.id !== id || !('result' in body) || 'error' in body) throw new Error('Invalid independent RPC response')
      return body.result
    },
  }, { retryCount: 0 }) }) as PublicClient
  if (receipt) {
    const chain = flags.get('--anchor-chain')
    if (chain !== undefined && chain !== '56' && chain !== '97') throw new Error('Anchor chain must be 56 or 97')
    const anchor = await inspectReceiptAnchor(input, rpc, { ...(chain ? { chainId: Number(chain) as 56 | 97 } : {}), ...(flags.has('--anchor-contract') ? { contract: flags.get('--anchor-contract')! } : {}) })
    report['anchor'] = anchor
    process.exitCode = anchor.state === 'VERIFIABLE' ? 0 : anchor.state === 'FAILED' ? 1 : 2
  } else {
    const evidence = await inspectCommerceBundle(input, rpc, ref => inspectTransaction(rpc, ref), { ...(flags.has('--artifact') ? { artifactBytes: local(flags.get('--artifact')!) } : {}) })
    report['commerce'] = evidence
    process.exitCode = evidence.state === 'FAILED' ? 1 : evidence.state !== 'VERIFIABLE' ? 2 : flags.has('--artifact') && (!('artifact' in evidence) || evidence.artifact.state !== 'VERIFIABLE') ? 2 : 0
  }
  report['rpc'] = { origin: parsed.origin, calls, maxCalls: 128, maxSeconds: 120, maxResponseBytes: 1024 * 1024, retryCount: 0 }
  console.log(JSON.stringify(report, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2))
}
main().catch(() => { console.error('Inspection failed: check the local bundle, supported options and explicit public RPC. No write was attempted.'); process.exitCode = 1 })
