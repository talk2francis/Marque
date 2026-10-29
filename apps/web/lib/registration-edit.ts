import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { chainClient, isSupportedChain, network } from '@marque/commerce'
import { readRegistrationMetadata } from '@marque/probe'
import { syncDeclaredServices } from '@marque/registry'

/**
 * Editing an agent's ERC-8004 registration from Marque (29 Oct). The owner's own wallet signs setAgentURI; Marque only
 * reads the current registration for the form and, once the transaction is in, re-indexes that one agent so its new
 * name, description, image and services show at once instead of on the next registry sweep.
 */
const abi = [
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
] as const

export interface RegistrationRead { agentId: string; chainId: 56 | 97; tokenId: string; owner: string; stored: 'onchain' | 'hosted'; registration: Record<string, unknown> }

function ids(chainId: number, tokenId: string) {
  if (!isSupportedChain(chainId) || !/^\d{1,78}$/.test(tokenId)) return null
  const registry = network(chainId).identityRegistry
  return { chainId: chainId as 56 | 97, tokenId, registry, agentId: `${chainId}:${registry.toLowerCase()}:${tokenId}` }
}

export async function readRegistration(chainId: number, tokenId: string): Promise<RegistrationRead | null> {
  const k = ids(chainId, tokenId)
  if (!k) return null
  const c = chainClient(k.chainId)
  const [uri, owner] = await Promise.all([
    c.readContract({ address: k.registry, abi, functionName: 'tokenURI', args: [BigInt(tokenId)] }),
    c.readContract({ address: k.registry, abi, functionName: 'ownerOf', args: [BigInt(tokenId)] }),
  ])
  const registration = await readRegistrationMetadata(uri)
  if (!registration) return null
  return { agentId: k.agentId, chainId: k.chainId, tokenId, owner: String(owner).toLowerCase(), stored: uri.startsWith('data:') ? 'onchain' : 'hosted', registration }
}

/** Re-read one agent's registration from chain into Marque's index (derived state, rebuildable from chain). */
export async function reindexRegistration(chainId: number, tokenId: string): Promise<{ name: string | null } | null> {
  const k = ids(chainId, tokenId)
  if (!k) return null
  const c = chainClient(k.chainId)
  const blockNumber = await c.getBlockNumber({ cacheTime: 0 })
  const uri = await c.readContract({ address: k.registry, abi, functionName: 'tokenURI', args: [BigInt(tokenId)], blockNumber })
  const meta = await readRegistrationMetadata(uri)
  if (!meta) return null
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  const name = str(meta['name'], 120)
  await db().execute(sql`update agent set
      name = coalesce(${name}, name),
      description = coalesce(${str(meta['description'], 2000)}, description),
      raw_metadata = jsonb_set(coalesce(raw_metadata, '{}'::jsonb), '{offchain_content}', ${JSON.stringify(meta)}::jsonb, true)
    where id = ${k.agentId}`)
  await syncDeclaredServices({ agentId: k.agentId, tokenId, chainId: k.chainId, blockNumber: String(blockNumber), metadata: meta }).catch(() => undefined)
  return { name }
}
