import { erc20Abi, type Address } from 'viem'

/** A grant's lifetime ceiling is not a deposit. Require only usable starting funds. */
export interface StartingFunds { token: Address; symbol: string; minimum: bigint; nativeWrap?: bigint }
export function assertGrantWallet(actual: { address?: string; chainId?: number }, owner: string, chainId: number) {
  if (actual.address?.toLowerCase() !== owner.toLowerCase()) throw new Error('The connected wallet changed. Close this review and read your wallet again.')
  if (actual.chainId !== chainId) throw new Error('The wallet network changed. Switch back to this charter’s network before signing.')
}
export async function checkStartingFunds(
  client: { readContract: (args: { address: Address; abi: typeof erc20Abi; functionName: 'balanceOf'; args: [Address] }) => Promise<bigint>; getBalance: (args: { address: Address }) => Promise<bigint> },
  owner: Address, needs: StartingFunds[],
) {
  for (const need of needs) {
    let balance: bigint
    try { balance = await client.readContract({ address: need.token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }) }
    catch { throw new Error(`Your ${need.symbol} balance could not be read. Read your wallet again before granting.`) }
    // A named wrap is part of this exact grant. Native BNB must also cover fees (checked by the grant hook).
    if (balance < need.minimum && need.nativeWrap && balance + need.nativeWrap >= need.minimum) {
      const native = await client.getBalance({ address: owner })
      if (native >= need.nativeWrap) continue
    }
    if (balance < need.minimum) throw new Error(`Your wallet has too little ${need.symbol} for this charter to start. Add ${need.symbol}, then read your wallet again. The lifetime limit is a ceiling, not a deposit.`)
  }
}
