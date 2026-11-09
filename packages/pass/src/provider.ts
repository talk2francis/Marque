import { createPublicClient, http, numberToHex, hexToBigInt, keccak256, type Hex, type PublicClient, type TransactionSerializableLegacy } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import type { PrivateKeyAccount } from 'viem/accounts'

/**
 * The EIP-1193 provider behind the Marque Pass connector (SPEC-ACCESS 2.3).
 *
 * Reads go straight to the chain's RPC. Anything that signs goes through `confirm`, which the app
 * renders as its own plain-words confirmation; the account it returns comes from one passkey prompt
 * and is never stored by this module. On BSC testnet a transaction MegaFuel will sponsor is signed
 * with a zero gas price and sent to the relay; the receipt is verified on chain, and if the relay
 * never lands it, the same nonce is re-signed self-paid (so at most one of the two can ever land).
 * Mainnet (56) stays off until Francis writes "approved, passkey mainnet" (G-P1).
 */

export type PassChain = 56 | 97
export interface PassTxRequest { from?: Hex; to?: Hex; data?: Hex; value?: Hex; gas?: Hex; gasPrice?: Hex; nonce?: Hex }
export type ConfirmRequest =
  | { kind: 'transaction'; chainId: PassChain; tx: { to: Hex; data: Hex; value: bigint }; feeWei: bigint; sponsored: boolean }
  /** An EIP-5792 batch: every step shown at once, one confirmation and one passkey prompt for all of them. */
  | { kind: 'calls'; chainId: PassChain; calls: Array<{ to: Hex; data: Hex; value: bigint }>; feeWei: bigint }
  | { kind: 'message'; chainId: PassChain; message: string }
  | { kind: 'typedData'; chainId: PassChain; typedData: unknown }

export interface PassProviderOptions {
  address: () => Hex | null
  /** Shows the confirmation; resolves with the unlocked account, or rejects when the user cancels. */
  confirm: (req: ConfirmRequest) => Promise<PrivateKeyAccount>
  rpc?: Partial<Record<PassChain, string>>
  /** Same-origin proxy to MegaFuel (testnet only): POST { method, params } → JSON-RPC result. */
  relay?: (method: 'pm_isSponsorable' | 'eth_sendRawTransaction', params: unknown[]) => Promise<unknown>
  mainnetEnabled?: boolean
  /** How long to wait for a relayed transaction before paying gas ourselves. */
  relayTimeoutMs?: number
  log?: (event: string, data: Record<string, unknown>) => void
}

export class ProviderRpcError extends Error {
  constructor(public code: number, message: string) { super(message) }
}

const DEFAULT_RPC: Record<PassChain, string> = { 56: 'https://bsc-dataseed.bnbchain.org', 97: 'https://bsc-testnet-rpc.publicnode.com' }
const READS = new Set(['eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_feeHistory', 'eth_gasPrice', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getCode', 'eth_getLogs', 'eth_getStorageAt', 'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_maxPriorityFeePerGas', 'net_version'])
const MIN_GAS_PRICE: Record<PassChain, bigint> = { 56: 50_000_000n, 97: 100_000_000n }

type Listener = (...args: unknown[]) => void

/** EIP-5792 call batches this provider sent, by id, for wallet_getCallsStatus (memory only). */
interface Batch { chainId: PassChain; hashes: Hex[]; total: number; failedAt: number | null }
interface SendCallsRequest { version?: string; chainId?: Hex; from?: Hex; atomicRequired?: boolean; calls?: Array<{ to?: Hex; data?: Hex; value?: Hex }> }
const MAX_CALLS = 6

export function createPassProvider(opts: PassProviderOptions) {
  let chainId: PassChain = 97
  const listeners = new Map<string, Set<Listener>>()
  const clients = new Map<PassChain, PublicClient>()
  const client = (c: PassChain) => {
    let x = clients.get(c)
    if (!x) { x = createPublicClient({ chain: c === 56 ? bsc : bscTestnet, transport: http(opts.rpc?.[c] ?? DEFAULT_RPC[c], { timeout: 15_000, retryCount: 1 }) }) as PublicClient; clients.set(c, x) }
    return x
  }
  const emit = (event: string, ...args: unknown[]) => { for (const l of listeners.get(event) ?? []) { try { l(...args) } catch { /* listener error */ } } }
  const log = opts.log ?? (() => undefined)
  const need = () => { const a = opts.address(); if (!a) throw new ProviderRpcError(4100, 'Marque Pass is locked or not set up on this device.'); return a }
  const gasPriceFor = (c: PassChain, network: bigint) => (network > MIN_GAS_PRICE[c] ? network : MIN_GAS_PRICE[c])
  const batches = new Map<Hex, Batch>()

  /**
   * EIP-5792 wallet_sendCalls, not atomic: one confirmation lists every step, one passkey prompt unlocks the key,
   * then each call is signed and sent in order with consecutive nonces, self-paid (no MegaFuel for batches). A call
   * whose gas cannot be estimated before the earlier ones land (it depends on them) is estimated after the previous
   * receipt. Returns once every call is broadcast, so leaving the page cannot strand half a batch unsigned.
   */
  async function sendCalls(req: SendCallsRequest): Promise<{ id: Hex }> {
    const from = need()
    if (req.from && req.from.toLowerCase() !== from.toLowerCase()) throw new ProviderRpcError(4100, 'Those calls are for a different account.')
    if (req.chainId && Number(req.chainId) !== chainId) throw new ProviderRpcError(5710, 'Marque Pass is on a different network. Switch network first.')
    if (req.atomicRequired) throw new ProviderRpcError(5760, 'Marque Pass sends a batch one transaction after another, not atomically.')
    const list = req.calls ?? []
    if (list.length === 0 || list.length > MAX_CALLS) throw new ProviderRpcError(-32602, `Send between 1 and ${MAX_CALLS} calls.`)
    if (list.some((x) => !x.to)) throw new ProviderRpcError(4200, 'Marque Pass does not deploy contracts.')
    const c = client(chainId)
    const calls = list.map((x) => ({ to: x.to as Hex, data: (x.data ?? '0x') as Hex, value: x.value ? hexToBigInt(x.value) : 0n }))
    const [startNonce, networkGasPrice, estimates] = await Promise.all([
      c.getTransactionCount({ address: from, blockTag: 'pending' }),
      c.getGasPrice(),
      Promise.all(calls.map((tx) => c.estimateGas({ account: from, ...tx }).then((g) => (g * 12n) / 10n).catch(() => null))),
    ])
    if (estimates[0] === null) await c.estimateGas({ account: from, ...calls[0]! }) // the first call must stand on its own: surface its revert now
    const gasPrice = gasPriceFor(chainId, networkGasPrice)
    // A call estimated later is shown at the largest estimate in the batch, so the fee shown is never an undercount.
    const known = estimates.filter((g): g is bigint => g !== null)
    const largest = known.reduce((m, g) => (g > m ? g : m), 0n)
    const feeWei = estimates.reduce<bigint>((sum, g) => sum + (g ?? largest), 0n) * gasPrice
    const batchChain = chainId
    const account = await opts.confirm({ kind: 'calls', chainId: batchChain, calls, feeWei })
    const id = keccak256(`0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')}`)
    const batch: Batch = { chainId: batchChain, hashes: [], total: calls.length, failedAt: null }
    batches.set(id, batch)
    for (let i = 0; i < calls.length; i++) {
      const tx = calls[i]!
      let gas = estimates[i]
      if (gas === null || gas === undefined) {
        const prev = batch.hashes[i - 1]
        if (prev) {
          const r = await c.waitForTransactionReceipt({ hash: prev, timeout: 120_000 })
          if (r.status !== 'success') { batch.failedAt = i - 1; break }
        }
        gas = (await c.estimateGas({ account: from, ...tx }) * 12n) / 10n
      }
      const raw = await account.signTransaction({ type: 'legacy', chainId: batchChain, nonce: startNonce + i, to: tx.to, data: tx.data, value: tx.value, gas, gasPrice })
      batch.hashes.push(await c.sendRawTransaction({ serializedTransaction: raw }))
    }
    log('pass_batch', { id, chainId: batchChain, calls: calls.length, sent: batch.hashes.length })
    return { id }
  }

  /** EIP-5792 wallet_getCallsStatus: 100 pending, 200 all confirmed, 500 all reverted, 600 some reverted. */
  async function callsStatus(id: Hex) {
    const batch = batches.get(id)
    if (!batch) throw new ProviderRpcError(5730, 'Marque Pass does not know that batch on this page.')
    const c = client(batch.chainId)
    const receipts = await Promise.all(batch.hashes.map((hash) => c.getTransactionReceipt({ hash }).catch(() => null)))
    const landed = receipts.filter((r): r is NonNullable<typeof r> => r !== null)
    const reverted = landed.filter((r) => r.status !== 'success').length
    const complete = landed.length === batch.hashes.length && (batch.failedAt !== null || batch.hashes.length === batch.total)
    // Complete: all confirmed (200); nothing applied (500); some applied (600).
    const status = !complete ? 100 : reverted === 0 && batch.hashes.length === batch.total ? 200 : reverted === landed.length ? 500 : 600
    return {
      version: '2.0.0', id, chainId: numberToHex(batch.chainId), status, atomic: false,
      receipts: landed.map((r) => ({ logs: r.logs.map((l) => ({ address: l.address, data: l.data, topics: l.topics })), status: r.status === 'success' ? '0x1' : '0x0', blockHash: r.blockHash, blockNumber: numberToHex(r.blockNumber), gasUsed: numberToHex(r.gasUsed), transactionHash: r.transactionHash })),
    }
  }

  async function sendTransaction(req: PassTxRequest): Promise<Hex> {
    const from = need()
    if (req.from && req.from.toLowerCase() !== from.toLowerCase()) throw new ProviderRpcError(4100, 'That transaction is for a different account.')
    if (!req.to) throw new ProviderRpcError(4200, 'Marque Pass does not deploy contracts.')
    const c = client(chainId)
    const tx = { to: req.to, data: (req.data ?? '0x') as Hex, value: req.value ? hexToBigInt(req.value) : 0n }
    const [nonce, gasEstimate, networkGasPrice] = await Promise.all([
      req.nonce ? Promise.resolve(Number(hexToBigInt(req.nonce))) : c.getTransactionCount({ address: from, blockTag: 'pending' }),
      req.gas ? Promise.resolve(hexToBigInt(req.gas)) : c.estimateGas({ account: from, ...tx }),
      c.getGasPrice(),
    ])
    const gas = req.gas ? gasEstimate : (gasEstimate * 12n) / 10n
    const gasPrice = req.gasPrice ? hexToBigInt(req.gasPrice) : gasPriceFor(chainId, networkGasPrice)
    // MegaFuel sponsors ERC-8183 hire calls on testnet, never ERC-20 approve (FACTS 5).
    let sponsored = false
    if (chainId === 97 && opts.relay) {
      try {
        const r = await opts.relay('pm_isSponsorable', [{ to: tx.to, from, value: numberToHex(tx.value), data: tx.data, gas: numberToHex(gas) }]) as { sponsorable?: boolean } | null
        sponsored = Boolean(r?.sponsorable)
      } catch { sponsored = false }
    }
    const account = await opts.confirm({ kind: 'transaction', chainId, tx, feeWei: gas * gasPrice, sponsored })
    const base: TransactionSerializableLegacy = { type: 'legacy', chainId, nonce, to: tx.to, data: tx.data, value: tx.value, gas, gasPrice }
    if (sponsored && opts.relay) {
      const raw = await account.signTransaction({ ...base, gasPrice: 0n })
      const signedHash = keccak256(raw)
      try {
        await opts.relay('eth_sendRawTransaction', [raw])
        const landed = await c.waitForTransactionReceipt({ hash: signedHash, timeout: opts.relayTimeoutMs ?? 30_000 }).catch(() => null)
        if (landed) { log('pass_sponsored', { hash: signedHash, chainId }); return signedHash }
        log('pass_relay_unseen', { hash: signedHash })
      } catch (e) { log('pass_relay_rejected', { error: e instanceof Error ? e.message.slice(0, 120) : 'error' }) }
      // Same nonce, self-paid: whichever lands first, the other can never land.
      const late = await c.getTransactionReceipt({ hash: signedHash }).catch(() => null)
      if (late) return signedHash
    }
    const raw = await account.signTransaction(base)
    const hash = await c.sendRawTransaction({ serializedTransaction: raw })
    log('pass_self_paid', { hash, chainId })
    return hash
  }

  return {
    isMarquePass: true as const,
    async request({ method, params }: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown> {
      const p = (Array.isArray(params) ? params : []) as unknown[]
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': { const a = opts.address(); return a ? [a] : [] }
        case 'eth_chainId': return numberToHex(chainId)
        case 'wallet_switchEthereumChain': {
          const target = Number((p[0] as { chainId?: string } | undefined)?.chainId)
          if (target === 97 || (target === 56 && opts.mainnetEnabled)) {
            if (target !== chainId) { chainId = target as PassChain; emit('chainChanged', numberToHex(chainId)) }
            return null
          }
          throw new ProviderRpcError(4902, target === 56 ? 'Marque Pass works on BSC testnet for now. Use a wallet app for mainnet.' : 'Marque Pass works on BSC only.')
        }
        case 'wallet_getCapabilities': {
          // EIP-5792: batches work on both chains, one transaction after another (not atomic).
          const chains: PassChain[] = opts.mainnetEnabled ? [56, 97] : [97]
          return Object.fromEntries(chains.map((c) => [numberToHex(c), { atomic: { status: 'unsupported' } }]))
        }
        case 'wallet_sendCalls': return sendCalls((p[0] ?? {}) as SendCallsRequest)
        case 'wallet_getCallsStatus': return callsStatus(p[0] as Hex)
        case 'eth_sendTransaction': return sendTransaction(p[0] as PassTxRequest)
        case 'personal_sign': {
          need()
          const [data] = p as [Hex]
          const text = (() => { try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from((data.slice(2).match(/../g) ?? []).map((x) => parseInt(x, 16)))) } catch { return data } })()
          const account = await opts.confirm({ kind: 'message', chainId, message: text })
          return account.signMessage({ message: { raw: data } })
        }
        case 'eth_signTypedData_v4': {
          need()
          const typed = typeof p[1] === 'string' ? JSON.parse(p[1] as string) : p[1]
          const account = await opts.confirm({ kind: 'typedData', chainId, typedData: typed })
          return account.signTypedData(typed as Parameters<PrivateKeyAccount['signTypedData']>[0])
        }
        default:
          if (READS.has(method)) return client(chainId).request({ method: method as 'eth_blockNumber', params: p as never })
          throw new ProviderRpcError(4200, `Marque Pass does not support ${method}.`)
      }
    },
    on(event: string, l: Listener) { const s = listeners.get(event) ?? new Set(); s.add(l); listeners.set(event, s) },
    removeListener(event: string, l: Listener) { listeners.get(event)?.delete(l) },
    /** For the connector: announce a new account (created, restored) or a lock. */
    announce(accounts: Hex[]) { emit('accountsChanged', accounts) },
    get chainId() { return chainId },
  }
}

export type PassProvider = ReturnType<typeof createPassProvider>
