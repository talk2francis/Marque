/**
 * A wallet for Playwright: an EIP-1193 provider injected into the page, answered from Node.
 *
 * It lets scripts drive the real UI (RainbowKit's Connect, the hire sheet, the Job Room)
 * end to end. Reads go to a public BSC RPC; signing happens in Node with viem, only when a
 * private key is given (read-only mode rejects every signature with code 4001, exactly like a
 * user pressing Reject). The key never enters the page.
 *
 *   import { attachWallet } from './headless-wallet.mjs'
 *   await attachWallet(context, { address })                // read-only
 *   await attachWallet(context, { privateKey, log })        // signs and sends
 *   await connectInPage(page)                                // clicks Connect and the injected wallet
 */
import { createPublicClient, createWalletClient, http, numberToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'

const CHAINS = { 56: bsc, 97: bscTestnet }
const RPC = {
  56: process.env.HEADLESS_RPC_56 ?? 'https://bsc-dataseed.bnbchain.org',
  97: process.env.HEADLESS_RPC_97 ?? 'https://bsc-testnet-rpc.publicnode.com',
}
const SIGNING = new Set(['eth_sendTransaction', 'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v4', 'wallet_sendCalls'])

export async function attachWallet(context, { privateKey, address, chainId = 56, log = () => {} } = {}) {
  const account = privateKey ? privateKeyToAccount(privateKey) : null
  const addr = (account?.address ?? address)
  if (!addr) throw new Error('attachWallet needs a privateKey or an address')
  let current = chainId
  const pub = (id) => createPublicClient({ chain: CHAINS[id], transport: http(RPC[id]) })
  const wallet = (id) => createWalletClient({ account, chain: CHAINS[id], transport: http(RPC[id]) })

  await context.exposeBinding('__headlessWallet', async (_src, method, params) => {
    params = params ?? []
    try {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return { result: [addr] }
        case 'eth_chainId': return { result: numberToHex(current) }
        case 'net_version': return { result: String(current) }
        case 'wallet_switchEthereumChain': {
          const id = Number(params[0]?.chainId)
          if (!CHAINS[id]) return { error: { code: 4902, message: 'Unrecognized chain' } }
          current = id
          return { result: null, chainChanged: numberToHex(id) }
        }
        case 'wallet_getCapabilities': return { result: {} }
        case 'wallet_getPermissions':
        case 'wallet_requestPermissions': return { result: [{ parentCapability: 'eth_accounts' }] }
      }
      if (SIGNING.has(method)) {
        if (!account) return { error: { code: 4001, message: 'User rejected the request.' } }
        const w = wallet(current)
        if (method === 'eth_sendTransaction') {
          const tx = params[0]
          log(`sign tx to ${tx.to} data ${String(tx.data ?? '').slice(0, 10)} on ${current}`)
          const hash = await w.sendTransaction({
            to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined,
            gas: tx.gas ? BigInt(tx.gas) : undefined,
          })
          log(`sent ${hash}`)
          return { result: hash }
        }
        if (method === 'personal_sign') return { result: await w.signMessage({ message: { raw: params[0] } }) }
        if (method.startsWith('eth_signTypedData')) {
          const td = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1]
          const types = Object.fromEntries(Object.entries(td.types).filter(([k]) => k !== 'EIP712Domain'))
          return { result: await w.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message }) }
        }
        return { error: { code: 4200, message: `${method} is not supported` } }
      }
      // Everything else is a read: pass it straight to the chain.
      return { result: await pub(current).request({ method, params }) }
    } catch (e) {
      return { error: { code: e?.code ?? -32603, message: String(e?.shortMessage ?? e?.message ?? e).slice(0, 300) } }
    }
  })

  await context.addInitScript(({ addr, chainHex }) => {
    const listeners = {}
    const emit = (ev, v) => (listeners[ev] ?? []).forEach((f) => { try { f(v) } catch { /* a listener error must not break the wallet */ } })
    const provider = {
      isMetaMask: false, isHeadless: true, _chainId: chainHex,
      async request({ method, params }) {
        const r = await window.__headlessWallet(method, params)
        if (r.chainChanged) { provider._chainId = r.chainChanged; emit('chainChanged', r.chainChanged) }
        if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e }
        return r.result
      },
      on(ev, f) { (listeners[ev] ??= []).push(f); return provider },
      removeListener(ev, f) { listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== f); return provider },
    }
    window.ethereum = provider
    const info = { uuid: '0b5a4c1e-6a55-4b1e-9f3e-headless0001', name: 'Headless Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E', rdns: 'trade.marque.headless' }
    const announce = () => window.dispatchEvent(new window.CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }))
    window.addEventListener('eip6963:requestProvider', announce)
    announce()
    void addr
  }, { addr, chainHex: numberToHex(chainId) })
  return { address: addr }
}

/**
 * Open RainbowKit's modal and pick the injected wallet. wagmi reconnects an injected wallet that
 * already answers eth_accounts on its own, so an account button already showing means done.
 */
export async function connectInPage(page) {
  const account = page.getByRole('button', { name: /open account menu/i }).locator('visible=true')
  await page.waitForTimeout(2500)
  if (await account.count()) return
  await page.getByRole('button', { name: /connect/i }).locator('visible=true').first().click()
  const option = page.locator('[data-testid^="rk-wallet-option"]').filter({ hasText: /headless|injected|browser wallet/i }).first()
  await option.waitFor({ timeout: 15000 })
  await option.click()
  await account.first().waitFor({ timeout: 15000 })
}
