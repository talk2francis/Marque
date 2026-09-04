/**
 * P6 acceptance — bounded authority on BSC TESTNET.
 *
 *   pnpm tsx scripts/p6-acceptance.mts
 *
 * Grants a charter with a real allowlist, cap and expiry; executes through it;
 * attempts a call OUTSIDE the allowlist and shows it refused; revokes; and
 * shows a subsequent execution failing.
 *
 * Testnet only. A mainnet grant is escalation gate 1 and both providers refuse
 * to be constructed for chain 56.
 */
import { AltanaCharterService, RegistryCharterService, toSmallestUnit, type CharterService, type CharterGrant } from '@marque/mandates'

const PK = process.env['MARQUE_TESTNET_PK'] as `0x${string}`
const RPC = process.env['BSC_TESTNET_RPC'] ?? 'https://bsc-testnet-rpc.publicnode.com'
const REGISTRY = (process.env['MARQUE_REGISTRY_ADDRESS_TESTNET'] ?? '0x01D584f3a07Ba07D114386A78CA7fa3103db7AE7') as `0x${string}`

/** WBNB on BSC testnet — the contract the charter is allowed to touch. */
const WBNB_TESTNET = '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd'
/** A contract deliberately NOT in the allowlist, used to prove refusal. */
const NOT_ALLOWED = '0x0000000000000000000000000000000000000dEaD'

function line(t: string) { console.log(`\n${'='.repeat(74)}\n${t}\n${'='.repeat(74)}`) }

function buildGrant(owner: string): CharterGrant {
  return {
    owner,
    agentId: 'marque:reference:keel',
    chainId: 97,
    calls: [{ to: WBNB_TESTNET, label: 'WBNB (testnet)' }],
    spend: [{
      // 0.01 tBNB. Expressed through toSmallestUnit so the decimals trap in
      // Altana's own docs cannot be hand-rolled wrong.
      limit: toSmallestUnit(0.01, 18),
      period: 'day',
      decimals: 18,
      symbol: 'tBNB',
    }],
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }
}

async function exercise(name: string, svc: CharterService): Promise<boolean> {
  line(`${name.toUpperCase()} — grant · execute · refuse · revoke`)
  try {
    const wallet = await svc.provisionWallet({ label: 'marque-p6' })
    console.log(`  wallet     : ${wallet.address} (${wallet.provider})`)

    const grant = buildGrant(wallet.address)
    const charter = await svc.grant(grant)
    console.log(`\n(a) CHARTER GRANTED`)
    console.log(`  id         : ${charter.id}`)
    console.log(`  session key: ${charter.sessionKeyAddress}`)
    console.log(`  grant tx   : ${charter.grantTxHash ?? '(relay reported none)'}`)
    console.log(`  allowlist  : ${grant.calls.map((c) => `${c.label ?? c.to}`).join(', ')}`)
    console.log(`  cap        : 0.01 tBNB per day`)
    console.log(`  expires    : ${new Date(grant.expiresAt * 1000).toISOString()}`)
    console.log(`  verify at  : ${charter.verifyUrl}`)

    const state = await svc.state(charter.id)
    console.log(`\n  live state (read from chain: ${state.fromChain})`)
    console.log(`    status   : ${state.status}`)
    console.log(`    remaining: ${state.remaining.map((r) => `${Number(r.remaining) / 10 ** r.decimals} ${r.symbol}`).join(', ')}`)
    console.log(`    expires in ${Math.floor(state.secondsRemaining / 3600)}h`)
    console.log(`    block    : ${state.blockNumber}`)

    line(`(e) A CALL OUTSIDE THE ALLOWLIST MUST BE REFUSED`)
    const outside = await svc.execute({
      charterId: charter.id,
      calls: [{ to: NOT_ALLOWED, data: '0x', value: 0n }],
    })
    console.log(`  ok         : ${outside.ok}`)
    console.log(`  refused    : ${outside.refusedBecause}`)
    console.log(`  detail     : ${outside.detail}`)
    console.log(`  in         : ${outside.latencyMs}ms`)

    line(`(b) A REAL TRANSACTION THROUGH THE CHARTER`)
    // WBNB deposit(): the canonical in-allowlist call. Value stays inside cap.
    const exec = await svc.execute({
      charterId: charter.id,
      calls: [{ to: WBNB_TESTNET, data: '0xd0e30db0', value: toSmallestUnit(0.001, 18) }],
    })
    console.log(`  ok         : ${exec.ok}`)
    console.log(`  tx         : ${exec.txHash ?? '—'}`)
    if (exec.detail) console.log(`  detail     : ${exec.detail}`)
    console.log(`  in         : ${exec.latencyMs}ms`)

    line(`(c) REVOCATION, AND A SUBSEQUENT ATTEMPT FAILING`)
    const revoked = await svc.revoke(charter.id)
    console.log(`  revoke ok  : ${revoked.ok}`)
    console.log(`  revoke tx  : ${revoked.txHash ?? '—'}`)
    if (revoked.detail) console.log(`  detail     : ${revoked.detail}`)

    const afterState = await svc.state(charter.id)
    console.log(`  status now : ${afterState.status} (read from chain)`)

    const after = await svc.execute({
      charterId: charter.id,
      calls: [{ to: WBNB_TESTNET, data: '0xd0e30db0', value: toSmallestUnit(0.001, 18) }],
    })
    console.log(`  post-revoke execute ok: ${after.ok}`)
    console.log(`  refused    : ${after.refusedBecause}`)
    console.log(`  detail     : ${after.detail}`)

    return true
  } catch (err) {
    console.log(`\n  ${name} FAILED: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

async function main(): Promise<void> {
  if (!PK) { console.error('MARQUE_TESTNET_PK is not set'); process.exit(1) }

  // Altana first. If it works, that is the shipped path.
  let altanaWorked = false
  try {
    const altana = new AltanaCharterService({ adminPrivateKey: PK, chainId: 97 })
    altanaWorked = await exercise('altana', altana)
  } catch (err) {
    console.log(`\naltana could not be constructed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // P6-lite always runs, so the fallback is proven rather than assumed.
  const registry = new RegistryCharterService({
    registryAddress: REGISTRY, privateKey: PK, rpcUrl: RPC, chainId: 97,
  })
  const liteWorked = await exercise('registry (P6-lite)', registry)

  line('SUMMARY')
  console.log(`  altana provider      : ${altanaWorked ? 'working' : 'NOT working'}`)
  console.log(`  registry (P6-lite)   : ${liteWorked ? 'working' : 'NOT working'}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
