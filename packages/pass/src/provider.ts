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
    const gasPrice = req.gasPrice ? hexToBigInt(req.gasPrice) : networkGasPrice > MIN_GAS_PRICE[chainId] ? networkGasPrice : MIN_GAS_PRICE[chainId]
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
        case 'wallet_getCapabilities': return {}
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
