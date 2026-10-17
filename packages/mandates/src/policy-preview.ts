import { z } from 'zod'
import { decodeFunctionData, encodeFunctionData } from 'viem'

const address = z.string().regex(/^0x[\da-fA-F]{40}$/).refine(x => !/^0x0{40}$/i.test(x))
const amount = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(x => BigInt(x) < 2n ** 256n)
const chain = z.union([z.literal(56), z.literal(97)])
const hash = z.string().regex(/^0x[\da-fA-F]{64}$/)
const seconds = z.number().int().nonnegative().safe()
const transfer = [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const
export const policyPreviewSchema = z.object({
  schema: z.literal('marque.policy-preview-input.v1'), asOf: seconds,
  policy: z.object({ chainId: chain, owner: address, account: address, target: address,
    selector: z.enum(['0x', '0xa9059cbb']), recipient: address,
    asset: z.union([z.literal('native'), address]), capRaw: amount, expiresAt: seconds }).strict(),
  state: z.object({ chainId: chain, owner: address, account: address, spentRaw: amount,
    revoked: z.boolean(), readAt: seconds, blockHash: hash, expectedBlockHash: hash }).strict(),
  attempt: z.object({ chainId: chain, from: address, to: address,
    data: z.string().regex(/^0x([\da-fA-F]{2})*$/).max(1024), valueRaw: amount }).strict(),
}).strict()
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Local denial preview only. Supplied state/from are unauthenticated claims.
 * No fetch, wallet, signing, allowance, grant, simulation or execution. */
export function inspectPolicyAttempt(value: unknown) {
  const parsed = policyPreviewSchema.safeParse(value)
  const result = (reason: string | null) => ({
    schema: 'marque.policy-preview.v1' as const, policyCheck: reason ? 'DENIED' as const : 'WITHIN_PROPOSED_BOUNDS' as const,
    reason, executionAllowed: false as const, authority: 'NONE' as const,
    stateProvenance: 'UNAUTHENTICATED_CALLER_SNAPSHOT' as const, signerProof: 'NOT_VERIFIED' as const,
    simulation: 'NOT_RUN' as const, onchainEnforcement: 'NOT_PROVEN' as const,
    serviceFeeEscrow: 'DOES_NOT_AUTHORIZE_ASSET_ACTIONS' as const,
  })
  if (!parsed.success) return result('invalid_input')
  const { policy: p, state: s, attempt: a, asOf } = parsed.data
  if (p.chainId !== s.chainId || p.chainId !== a.chainId) return result('wrong_chain')
  if (!same(p.owner, s.owner) || !same(p.account, s.account) || !same(a.from, p.account)) return result('account_or_owner_mismatch')
  if (!same(s.blockHash, s.expectedBlockHash)) return result('state_snapshot_changed')
  if (asOf - s.readAt > 30 || s.readAt > asOf + 5) return result('state_stale_or_future')
  if (s.revoked) return result('revoked_in_supplied_state')
  if (p.expiresAt <= asOf) return result('expired')
  if (!same(a.to, p.target)) return result('outside_target')
  let recipient: string, asset: string, spend: bigint, selector: string
  if (a.data === '0x') {
    recipient = a.to; asset = 'native'; spend = BigInt(a.valueRaw); selector = '0x'
  } else {
    if (a.data.slice(0, 10).toLowerCase() !== '0xa9059cbb') return result('unsupported_function')
    try {
      const decoded = decodeFunctionData({ abi: transfer, data: a.data as `0x${string}` })
      if (encodeFunctionData({ abi: transfer, functionName: 'transfer', args: decoded.args }).toLowerCase() !== a.data.toLowerCase()) return result('noncanonical_calldata')
      recipient = decoded.args[0]; spend = decoded.args[1]; asset = a.to; selector = '0xa9059cbb'
    } catch { return result('invalid_calldata') }
    if (BigInt(a.valueRaw) !== 0n) return result('unexpected_native_value')
  }
  if (p.selector !== selector) return result('outside_function')
  if (!same(p.asset, asset)) return result('outside_asset')
  if (!same(p.recipient, recipient)) return result('outside_recipient')
  if (BigInt(p.capRaw) === 0n || BigInt(s.spentRaw) + spend > BigInt(p.capRaw)) return result('over_cap')
  return result(null)
}
