'use client'
import { createConnector } from 'wagmi'
import { numberToHex, type Address } from 'viem'
import type { Wallet, WalletDetailsParams } from '@rainbow-me/rainbowkit'
import { createPassProvider, loadRecord, type PassProvider } from '@marque/pass'
import { passBridge, lock } from './bridge'

/**
 * The wagmi connector "Marque Pass" (SPEC-ACCESS 2.3) and its RainbowKit entry. BSC testnet only
 * until G-P1. Connecting with no Pass on this device opens Marque's own create-or-restore dialog;
 * signing always goes through Marque's confirmation and a passkey prompt.
 */
export const MARQUE_PASS_ID = 'marque-pass'
export const PASS_MAINNET = process.env['NEXT_PUBLIC_PASS_MAINNET'] === '1'

const ICON = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="7" fill="#141412"/><path d="M14 6.5a5 5 0 0 0-5 5v2.2h1.8v-2.2a3.2 3.2 0 1 1 6.4 0v2.2H19v-2.2a5 5 0 0 0-5-5Z" fill="#C79A4B"/><rect x="8" y="13" width="12" height="9" rx="2.2" fill="#EEEBE4"/><circle cx="14" cy="17.5" r="1.4" fill="#141412"/></svg>')}`

let shared: PassProvider | null = null
function provider(): PassProvider {
  if (!shared) {
    shared = createPassProvider({
      address: () => loadRecord()?.address ?? null,
      confirm: (req) => passBridge.confirm(req),
      relay: async (method, params) => {
        const r = await fetch('/api/v1/pass/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params }) })
        const j = await r.json() as { result?: unknown; detail?: string }
        if (!r.ok) throw new Error(j.detail ?? 'relay error')
        return j.result
      },
      mainnetEnabled: PASS_MAINNET,
    })
  }
  return shared
}

export function passConnector() {
  return createConnector<PassProvider>((config) => ({
    id: MARQUE_PASS_ID,
    name: 'Marque Pass',
    type: 'marquePass',
    icon: ICON,
    async connect(params?: { chainId?: number }) {
      const record = loadRecord() ?? await passBridge.onboard()
      const p = provider()
      const want = params?.chainId
      if (want && want !== p.chainId && (want === 97 || (want === 56 && PASS_MAINNET))) await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(want) }] })
      p.announce([record.address])
      return { accounts: [record.address as Address], chainId: p.chainId } as never
    },
    async disconnect() { lock() },
    async getAccounts() { const r = loadRecord(); return r ? [r.address as Address] : [] },
    async getChainId() { return provider().chainId },
    async getProvider() { return provider() },
    async isAuthorized() { return Boolean(loadRecord()) },
    async switchChain({ chainId }) {
      await provider().request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] })
      config.emitter.emit('change', { chainId })
      return config.chains.find((c) => c.id === chainId) ?? config.chains[0]
    },
    onAccountsChanged(accounts) { config.emitter.emit('change', { accounts: accounts as Address[] }) },
    onChainChanged(chain) { config.emitter.emit('change', { chainId: Number(chain) }) },
    onDisconnect() { config.emitter.emit('disconnect') },
  }))
}

/** RainbowKit entry. Shown only where WebAuthn exists; PRF itself is checked when the passkey is made. */
export const marquePassWallet = (): Wallet => ({
  id: MARQUE_PASS_ID,
  name: 'Marque Pass',
  shortName: 'Pass',
  iconUrl: ICON,
  iconBackground: '#141412',
  installed: true,
  createConnector: (walletDetails: WalletDetailsParams) => createConnector((config) => ({ ...passConnector()(config), ...walletDetails })),
})

export function passCapableBrowser(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && Boolean(navigator.credentials)
}
