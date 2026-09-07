/**
 * Fund the five reference-agent wallets with a little tBNB so each can
 * broadcast its own ERC-8004 registration.
 *
 * TESTNET ONLY. AGENTS.md gate 1 covers mainnet state changes; testnet is free.
 * The agent is the sole key-holder for its own wallet, so registration must be
 * signed by the agent's key, not the project wallet — hence a transfer rather
 * than registering on their behalf.
 */
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'

const AGENTS = {
  bound: '0x5B1c9fBc684a1722Bb5C66C0B22F149dA69768d6',
  keel: '0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00',
  lattice: '0x5aAF7b5B2170986C59279682Bd714c475ae8C718',
  redcell: '0x1F0D0eF5a279888E3b86c8a99A8A99F19fCEc587',
  sluicegate: '0x253F7Ad5D52099C4a2293418a661e9974DfB5e84',
}
const PER_AGENT = parseEther('0.01')

const pk = process.env.MARQUE_TESTNET_PK
if (!pk) throw new Error('MARQUE_TESTNET_PK not in env')
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`)
const RPC = (process.env.BSC_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545').split(',')[0].trim()
const transport = http(RPC)
const pub = createPublicClient({ chain: bscTestnet, transport })
const wallet = createWalletClient({ account, chain: bscTestnet, transport })

console.log(`funder ${account.address}  balance ${formatEther(await pub.getBalance({ address: account.address }))} tBNB`)

for (const [name, to] of Object.entries(AGENTS)) {
  const have = await pub.getBalance({ address: to })
  if (have >= PER_AGENT) { console.log(`${name.padEnd(11)} already holds ${formatEther(have)} tBNB — skipped`); continue }
  const hash = await wallet.sendTransaction({ to, value: PER_AGENT })
  const rcpt = await pub.waitForTransactionReceipt({ hash })
  console.log(`${name.padEnd(11)} ${formatEther(PER_AGENT)} tBNB  ${rcpt.status}  ${hash}`)
}
console.log(`funder left  ${formatEther(await pub.getBalance({ address: account.address }))} tBNB`)
