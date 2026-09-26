/**
 * P2-00: negotiate with each reference seller (the free quote call, no job is created) and verify
 * the signed quote with the SDK's own verifier against (a) the seller's configured wallet and
 * (b) the ERC-8004 agent wallet / owner on chain. READ ONLY.
 */
import { createPublicClient, http, fallback, type Address } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { NETWORKS } from '@bnbagent/sdk';
import { verifyQuoteSignature } from '@bnbagent/sdk/erc8183';

const SELLERS = [
  { slug: 'keel', id56: 341556n, id97: 2238n },
  { slug: 'sluicegate', id56: 341555n, id97: 2237n },
  { slug: 'lattice', id56: 341554n, id97: 2236n },
  { slug: 'bound', id56: 341553n, id97: 2234n },
  { slug: 'redcell', id56: 341557n, id97: 2239n },
];
const idAbi = [
  { type: 'function', name: 'getAgentWallet', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
] as const;
const client = (id: 56 | 97) =>
  createPublicClient({
    chain: id === 56 ? bsc : bscTestnet,
    transport: fallback(((id === 56 ? process.env.BSC_RPC_URLS : process.env.BSC_TESTNET_RPC) ?? '').split(',').filter(Boolean).map((u) => http(u, { timeout: 15_000 }))),
  });
const c56 = client(56), c97 = client(97);
const reg56 = NETWORKS['bsc-mainnet']!.registryContract as Address, reg97 = NETWORKS['bsc-testnet']!.registryContract as Address;
const base = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade';

const rows = [];
for (const s of SELLERS) {
  const t0 = Date.now();
  const res = await fetch(`${base}/agents/${s.slug}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'message/send',
      params: { message: { kind: 'message', role: 'user', messageId: `p2-00-${s.slug}-${Date.now()}`, parts: [{ kind: 'data', data: {
        skill: 'negotiate', task_description: 'marque-quote-probe', terms: { deliverables: 'quote only (Marque P2-00 protocol measurement)', quality_standards: 'n/a' },
      } }] } },
    }),
  });
  const latencyMs = Date.now() - t0;
  const body = (await res.json()) as { result?: { parts?: Array<{ data?: Record<string, unknown> }> } };
  type Quote = { chain_id: number; verifying_contract: string; response?: { terms?: { price?: string; currency?: string }; quote_expires_at: number; negotiated_at: number; estimated_completion_seconds?: number } };
  const q = body.result?.parts?.[0]?.data as (Quote & Record<string, unknown>) | undefined;
  if (!q) { rows.push({ slug: s.slug, error: 'no quote', http: res.status }); continue; }
  const chainId = q.chain_id as number;
  const c = chainId === 56 ? c56 : c97;
  const reg = chainId === 56 ? reg56 : reg97;
  const tokenId = chainId === 56 ? s.id56 : s.id97;
  const [agentWallet, owner] = await Promise.all([
    c.readContract({ address: reg, abi: idAbi, functionName: 'getAgentWallet', args: [tokenId] }).catch(() => null),
    c.readContract({ address: reg, abi: idAbi, functionName: 'ownerOf', args: [tokenId] }).catch(() => null),
  ]);
  // Mainnet identity wallets too, since the campaign identities are 341553..341557.
  const [agentWallet56, owner56] = await Promise.all([
    c56.readContract({ address: reg56, abi: idAbi, functionName: 'getAgentWallet', args: [s.id56] }).catch(() => null),
    c56.readContract({ address: reg56, abi: idAbi, functionName: 'ownerOf', args: [s.id56] }).catch(() => null),
  ]);
  const candidate = (agentWallet && agentWallet !== '0x0000000000000000000000000000000000000000' ? agentWallet : owner) as Address;
  const v = await verifyQuoteSignature({ envelope: q as never, provider: candidate, publicClient: c as never, expectedVerifyingContract: (chainId === 56 ? NETWORKS['bsc-mainnet']! : NETWORKS['bsc-testnet']!).commerceContract } as never);
  const terms = q.response?.terms ?? {};
  rows.push({
    slug: s.slug,
    latencyMs,
    chain_id: chainId,
    verifying_contract: q.verifying_contract,
    verifyingContractIsCanonical: String(q.verifying_contract).toLowerCase() === (chainId === 56 ? NETWORKS['bsc-mainnet']! : NETWORKS['bsc-testnet']!).commerceContract.toLowerCase(),
    price: terms.price,
    currency: terms.currency,
    quote_expires_at: q.response?.quote_expires_at,
    ttlSeconds: q.response ? q.response.quote_expires_at - q.response.negotiated_at : null,
    estimated_completion_seconds: q.response?.estimated_completion_seconds,
    identityOnQuoteChain: { tokenId: tokenId.toString(), agentWallet, owner },
    identityMainnet: { tokenId: s.id56.toString(), agentWallet: agentWallet56, owner: owner56 },
    sigCheckedAgainst: candidate,
    sdkVerify: v,
  });
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2));
