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
  bound: '0x72b99eFf53a7DbA31f66F7a98116bE7D84d4810B',
  keel: '0x35e2EcBcC9DCA14A85Cf99CC76eb6899c6f29566',
  lattice: '0x7d7216A4e4Ee5F2663aE273d492fE99D495E4e44',
  redcell: '0x5d47Ac7b6A73b4ebA1105677258e9baf904f9309',
  sluicegate: '0x6d5767Ca6e48B7103F3E660A2ff78148D2Ec6Ab4',
}
const PER_AGENT = parseEther('0.01')

const pk = process.env.MARQUE_TESTNET_PK
if (!pk) throw new Error('MARQUE_TESTNET_PK not in env')
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`)
const transport = http(process.env.BSC_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545')
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
