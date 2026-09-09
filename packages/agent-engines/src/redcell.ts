import { createHash } from 'node:crypto'
import type { Address } from 'viem'
import { publicClient } from '@marque/chain'
import { addresses } from './parse.js'
import { historicalContext, isRefusal } from './historical.js'
import { refuse, within, type Engine, type EngineAnswer, type EngineMeta } from './types.js'

/**
 * Redcell — approval and privilege triage on BNB Smart Chain.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * AGENTS.md sets a four-hour timebox on porting Archon's audit engine and names
 * the fallback explicitly: if the port is not clean, ship a thin approval-risk
 * and privileged-function triage agent over verified source rather than keep
 * pulling. The port is not clean, and the reason is not effort — it is
 * dependencies. Archon's pipeline needs `solc`, `slither` and BscScan-verified
 * source; none of the three is available here, and a BscScan API key is a new
 * external dependency. So the fallback was taken on the first hour, not the
 * fourth.
 *
 * What WAS ported from Archon is the part that travels: the severity model, the
 * finding schema, and the dedupe key. Those are the pieces that make findings
 * comparable across tools, and they are why this agent's output looks like an
 * auditor's rather than a scanner's.
 *
 * Every check below reads the CHAIN — deployed bytecode and `eth_call` — so
 * there is no dependency on a contract being verified anywhere. That is
 * genuinely stronger for triage: unverified contracts are exactly the ones a
 * buyer most needs a verdict on.
 *
 * THE LIMIT, STATED PLAINLY AND REPEATED IN EVERY RESPONSE: selector presence
 * is read out of the deployed dispatcher. It is reliable for a normal Solidity
 * contract and it can MISS a function reached only through a proxy, a fallback
 * router or an unusual optimiser layout. A clean result here is "nothing found
 * by this method", never "safe". No security agent that says "safe" should be
 * believed, and this one does not say it.
 */

// ── Ported from Archon (lib/scan/types.ts, lib/ai/enrichment.ts) ─────────────
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
}

/** Archon's finding shape, minus the fields that only make sense with source. */
export interface Finding {
  severity: Severity
  category: string
  title: string
  summary: string
  /** Concrete: what an attacker or a careless owner could actually do. */
  exploitScenario: string | null
  recommendedFix: string | null
  /** How much this method can actually tell you. Never 1. */
  confidence: number
  /** Stable across runs, so the same fact never appears twice. */
  dedupeKey: string
  /** How it was found. Everything here is 'onchain'; Archon also has 'slither'. */
  source: 'onchain'
}

function finding(f: Omit<Finding, 'dedupeKey' | 'source'> & { subject: string }): Finding {
  const { subject, ...rest } = f
  return {
    ...rest,
    dedupeKey: createHash('sha256')
      .update(`${subject.toLowerCase()}|${rest.category}|${rest.title}`)
      .digest('hex')
      .slice(0, 16),
    source: 'onchain',
  }
}

export const REDCELL_META: EngineMeta = {
  id: 'redcell',
  name: 'Redcell',
  category: 'security',
  // There is no published MCS test for security. Saying "untested" is the
  // honest state; inventing a warrant for our own agent would be worse than
  // having none (AGENTS.md invariant 6).
  testId: null,
  description:
    'Triages a BNB Smart Chain contract for the risks that actually empty wallets: upgradeability, privileged functions, mint authority, pausability, blacklists, and unlimited token approvals. Reads deployed bytecode and chain state, so it works on unverified contracts. It reports what it found, never that a contract is safe.',
  priceUsd: 0.25,
  skills: [
    {
      id: 'contract-triage',
      name: 'Triage a contract',
      description: 'Proxy status, ownership, pausability, mint authority and blacklist functions, read from deployed bytecode and chain state.',
      tags: ['security', 'bsc', 'proxy', 'privileged functions'],
    },
    {
      id: 'approval-risk',
      name: 'Check an approval',
      description: 'Reads a holder’s live allowance to a spender and flags an unlimited approval.',
      tags: ['security', 'approvals', 'erc20', 'allowance'],
    },
  ],
}

// EIP-1967 and EIP-1822 storage slots. Reading a slot is definitive: unlike a
// selector, a non-zero implementation pointer cannot be a false positive.
const SLOT_1967_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const
const SLOT_1967_ADMIN = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as const
const SLOT_1967_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as const
const SLOT_1822_IMPL = '0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7' as const

/** Functions whose presence changes what a holder is exposed to. */
const PRIVILEGED: Array<{ selector: string; signature: string; severity: Severity; category: string; what: string; scenario: string }> = [
  { selector: '0x40c10f19', signature: 'mint(address,uint256)', severity: 'high', category: 'supply-control', what: 'Someone can create new tokens.', scenario: 'The holder of this permission can mint supply to themselves and sell it into the same liquidity you are holding against, diluting you without any transaction of yours.' },
  { selector: '0xa0712d68', signature: 'mint(uint256)', severity: 'high', category: 'supply-control', what: 'Someone can create new tokens.', scenario: 'Supply can be increased after you buy, diluting every existing holder.' },
  { selector: '0x8456cb59', signature: 'pause()', severity: 'high', category: 'availability', what: 'Transfers can be frozen.', scenario: 'A pause taken while you hold the token stops you selling for as long as the privileged party chooses. Your position is not liquid on your own terms.' },
  { selector: '0xe47d6060', signature: 'isBlackListed(address)', severity: 'critical', category: 'censorship', what: 'Specific addresses can be blocked.', scenario: 'Your address can be individually prevented from transferring, which strands the balance rather than merely devaluing it.' },
  { selector: '0x0ecb93c0', signature: 'addBlackList(address)', severity: 'critical', category: 'censorship', what: 'Specific addresses can be blocked.', scenario: 'Your address can be added to a deny list and your balance becomes untransferable.' },
  { selector: '0xf9f92be4', signature: 'blacklist(address)', severity: 'critical', category: 'censorship', what: 'Specific addresses can be blocked.', scenario: 'Your address can be added to a deny list and your balance becomes untransferable.' },
  { selector: '0x153b0d1e', signature: 'setBlacklist(address,bool)', severity: 'critical', category: 'censorship', what: 'Specific addresses can be blocked.', scenario: 'Your address can be added to a deny list and your balance becomes untransferable.' },
  { selector: '0x69fe0e2d', signature: 'setFee(uint256)', severity: 'medium', category: 'economics', what: 'The transfer fee can be changed after you buy.', scenario: 'A fee raised after you enter is taken out of your exit. The number you modelled is not the number you pay.' },
  { selector: '0xc4081a4c', signature: 'setTaxFee(uint256)', severity: 'medium', category: 'economics', what: 'The transfer tax can be changed after you buy.', scenario: 'A tax raised after you enter is taken out of your exit.' },
  { selector: '0xec28438a', signature: 'setMaxTxAmount(uint256)', severity: 'medium', category: 'economics', what: 'The maximum transfer size can be changed.', scenario: 'A maximum lowered below your position size prevents you exiting in one transaction, and possibly at all.' },
  { selector: '0x3659cfe6', signature: 'upgradeTo(address)', severity: 'high', category: 'upgradeability', what: 'The contract logic can be replaced.', scenario: 'Whatever this contract does today is not what it must do tomorrow. Any review of its current behaviour has a shelf life measured by the upgrade key.' },
  { selector: '0x4f1ef286', signature: 'upgradeToAndCall(address,bytes)', severity: 'high', category: 'upgradeability', what: 'The contract logic can be replaced and called atomically.', scenario: 'Logic can be swapped and immediately invoked in one transaction, leaving no window in which to react.' },
  { selector: '0x79cc6790', signature: 'burnFrom(address,uint256)', severity: 'medium', category: 'supply-control', what: 'Balances can be burned from an address.', scenario: 'Where the allowance check is missing or bypassable, a privileged party can destroy tokens you hold.' },
  { selector: '0x57376198', signature: 'rescueTokens(address,uint256)', severity: 'medium', category: 'custody', what: 'Tokens held by the contract can be withdrawn by a privileged party.', scenario: 'Anything you send to or stake in this contract can be moved out by the key holder.' },
]

const MAX_UINT256 = (1n << 256n) - 1n
/** The other unlimited: many routers approve 2^255-1 rather than max uint. */
const NEAR_MAX = (1n << 255n) - 1n

const ownerAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }],
  },
] as const

function slotAddress(word: string | null | undefined): Address | null {
  if (!word || word === '0x' || /^0x0+$/.test(word)) return null
  const addr = `0x${word.slice(-40)}` as Address
  return /^0x0+$/.test(addr) ? null : addr
}

export const redcellEngine: Engine = {
  meta: REDCELL_META,
  async run(prompt, opts = {}): Promise<EngineAnswer> {
    const deadline = opts.deadlineMs ?? 7_000
    const found = addresses(prompt)
    const subject = found[0]
    if (!subject) {
      return refuse('no BNB Smart Chain address found in the task', 'the 0x address of the contract to triage')
    }
    // A second address is read as the holder whose approval to check. Stated,
    // never assumed silently — the response says which role each address took.
    const holder = found[1] ?? null
    const spender = found[2] ?? null

    try {
      const head = await within(publicClient().getBlockNumber(), 3_000, 'BNB Smart Chain')
      const ctx = historicalContext(prompt, head)
      if (isRefusal(ctx)) return ctx
      const { client, readAt } = ctx
      // Every read below is pinned to this block (historical) or reads head
      // (no block pinned). There is no path that reads a different block and
      // reports success.
      const at = readAt ?? head

      const code = await within(client.getCode({ address: subject, blockNumber: at }), deadline, 'the BSC node')
      if (!code || code === '0x') {
        return {
          address: subject,
          isContract: false,
          verdict: 'not a contract',
          findings: [],
          note: `${subject} has no code at block ${at}. It is an externally owned account, or a contract that has not been deployed yet.`,
          blockNumber: at.toString(),
        }
      }

      const [impl1967, admin1967, beacon, impl1822, owner, getOwner, paused, symbol] = await Promise.all([
        client.getStorageAt({ address: subject, slot: SLOT_1967_IMPL, blockNumber: at }).catch(() => null),
        client.getStorageAt({ address: subject, slot: SLOT_1967_ADMIN, blockNumber: at }).catch(() => null),
        client.getStorageAt({ address: subject, slot: SLOT_1967_BEACON, blockNumber: at }).catch(() => null),
        client.getStorageAt({ address: subject, slot: SLOT_1822_IMPL, blockNumber: at }).catch(() => null),
        client.readContract({ address: subject, abi: ownerAbi, functionName: 'owner', blockNumber: at }).catch(() => null),
        client.readContract({ address: subject, abi: ownerAbi, functionName: 'getOwner', blockNumber: at }).catch(() => null),
        client.readContract({ address: subject, abi: ownerAbi, functionName: 'paused', blockNumber: at }).catch(() => null),
        client.readContract({ address: subject, abi: ownerAbi, functionName: 'symbol', blockNumber: at }).catch(() => null),
      ])

      const findings: Finding[] = []
      const implementation = slotAddress(impl1967) ?? slotAddress(impl1822)
      const beaconAddress = slotAddress(beacon)
      const proxyAdmin = slotAddress(admin1967)

      if (implementation || beaconAddress) {
        findings.push(finding({
          subject,
          severity: 'high',
          category: 'upgradeability',
          title: 'This contract is a proxy and its logic can be replaced',
          summary: implementation
            ? `An EIP-1967 implementation pointer is set to ${implementation}. The code that runs is stored elsewhere and can be changed.`
            : `An EIP-1967 beacon pointer is set to ${beaconAddress}. The beacon decides which logic runs, for this proxy and every other one pointed at it.`,
          exploitScenario:
            'Any conclusion about what this contract does is valid only until the upgrade key is used. A review performed today does not constrain behaviour tomorrow, and the upgrade needs no cooperation from you.',
          recommendedFix:
            'Find out who holds the upgrade key and whether it is a timelock or a multisig. A proxy behind a 48-hour timelock is a different risk from one behind a single hot key.',
          confidence: 0.99,
        }))
      }

      const ownerAddress = (owner as Address | null) ?? (getOwner as Address | null)
      if (ownerAddress && !/^0x0+$/.test(ownerAddress)) {
        findings.push(finding({
          subject,
          severity: 'medium',
          category: 'privilege',
          title: 'A single owner address holds privileged control',
          summary: `owner() returns ${ownerAddress}.`,
          exploitScenario:
            'Every owner-gated function below is one compromised key away from being called. The concentration is the risk, not any individual function.',
          recommendedFix:
            'Check whether that address is an externally owned account, a multisig or a timelock. An EOA owner is the weakest of the three by a wide margin.',
          confidence: 0.95,
        }))
      }
      if (proxyAdmin) {
        findings.push(finding({
          subject,
          severity: 'medium',
          category: 'privilege',
          title: 'A proxy admin is set',
          summary: `The EIP-1967 admin slot holds ${proxyAdmin}. That address can change the implementation.`,
          exploitScenario: 'Whoever controls the admin address controls what this contract does, at any moment, with no notice.',
          recommendedFix: 'Verify the admin is a timelock or multisig rather than a single key.',
          confidence: 0.99,
        }))
      }
      if (paused === true) {
        findings.push(finding({
          subject,
          severity: 'critical',
          category: 'availability',
          title: 'This contract is paused RIGHT NOW',
          summary: 'paused() returns true at the block read.',
          exploitScenario: 'Transfers are currently blocked. A position taken now may not be exitable until a privileged party unpauses.',
          recommendedFix: 'Do not interact until it is unpaused, and find out why it was paused.',
          confidence: 0.99,
        }))
      }

      // Selector presence in the deployed dispatcher.
      const seen = new Set<string>()
      for (const p of PRIVILEGED) {
        if (!code.includes(p.selector.slice(2))) continue
        if (seen.has(p.category + p.severity + p.what)) continue
        seen.add(p.category + p.severity + p.what)
        findings.push(finding({
          subject,
          severity: p.severity,
          category: p.category,
          title: p.what,
          summary: `The deployed bytecode dispatches ${p.signature}.`,
          exploitScenario: p.scenario,
          recommendedFix: `Establish who may call ${p.signature} and under what delay. The function existing is not the problem; an unaccountable caller is.`,
          // Selector presence is strong evidence and not proof: a 4-byte
          // constant can in principle appear in unrelated bytecode.
          confidence: 0.85,
        }))
      }

      // Approval check, when the request named a holder and a spender.
      let approval: Record<string, unknown> | null = null
      if (holder && spender) {
        const allowance = await client.readContract({
          address: subject, abi: ownerAbi, functionName: 'allowance',
          args: [holder, spender], blockNumber: at,
        }).catch(() => null)
        if (allowance !== null) {
          const value = allowance as bigint
          const unlimited = value >= NEAR_MAX
          approval = {
            holder, spender,
            allowanceRaw: value.toString(),
            unlimited,
            maxUint256: value === MAX_UINT256,
          }
          if (unlimited) {
            findings.push(finding({
              subject,
              severity: 'high',
              category: 'approval',
              title: 'An unlimited approval is live',
              summary: `${holder} has approved ${spender} for an effectively unlimited amount of this token.`,
              exploitScenario:
                'If that spender is ever compromised or upgraded to hostile logic, the entire balance can be taken in one transaction, with no further action from the holder. The approval survives long after the transaction that needed it.',
              recommendedFix: 'Reduce the allowance to the amount actually needed, or revoke it by approving zero.',
              confidence: 0.99,
            }))
          }
        }
      }

      findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
      const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
      for (const f of findings) counts[f.severity]++

      return {
        address: subject,
        symbol: (symbol as string | null) ?? null,
        isContract: true,
        codeSize: (code.length - 2) / 2,
        proxy: {
          isProxy: Boolean(implementation || beaconAddress),
          implementation,
          beacon: beaconAddress,
          admin: proxyAdmin,
        },
        owner: ownerAddress ?? null,
        paused: paused === null ? null : paused === true,
        approval,
        findings,
        severityCounts: counts,
        // Deliberately not "safe". A triage that reports clean is reporting
        // the limits of its own method, and saying otherwise would be the one
        // dishonest sentence in this product.
        verdict: findings.length === 0
          ? 'nothing found by this method'
          : `${counts.critical} critical, ${counts.high} high, ${counts.medium} medium`,
        method: 'deployed bytecode selector scan plus EIP-1967/1822 storage slots and view calls, read on-chain',
        limitations: [
          'Selector presence is read from the deployed dispatcher. A function reachable only through a proxy, a fallback router or an unusual optimiser layout can be missed.',
          'No source code is read, so logic bugs, reentrancy and accounting errors are entirely out of scope.',
          'A clean result means nothing was found by this method. It never means the contract is safe.',
        ],
        blockNumber: at.toString(),
        readAt: new Date().toISOString(),
      }
    } catch (err) {
      return refuse(err instanceof Error ? err.message : String(err))
    }
  },
}
