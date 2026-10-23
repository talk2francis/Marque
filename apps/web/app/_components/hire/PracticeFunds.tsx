'use client'
import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useConfig } from 'wagmi'
import { parseAbi } from 'viem'
import { ArrowUpRight, Copy } from 'lucide-react'
import { Button, ButtonLink } from '../ui'

/**
 * Practice-lane funds (SPEC-ACCESS 1.2, BSC testnet only). Test tokens have no value and
 * are free, but a fresh wallet holds none:
 *   - BNB Chain's Telegram bot sends both (0.1 tBNB and 20 test U, seen 19 and 21 Oct) for
 *     the sentence below, with the buyer's address filled in.
 *   - With test BNB already in the wallet, 10 test U can also be claimed here from United
 *     Stables' public faucet contract (every 30 minutes), signed by the buyer's own wallet.
 * Marque sends nothing and holds nothing here.
 */
const U_FAUCET_CONTRACT = '0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3' as const
const faucetAbi = parseAbi(['function requestTokens()'])
const BOT_URL = 'https://t.me/bnbchain_official_bot'
const WEB_FAUCET = 'https://www.bnbchain.org/en/testnet-faucet'

export function PracticeFunds({ address, needGas, needToken, onDone }: {
  address: `0x${string}`
  needGas: boolean
  needToken: boolean
  onDone: () => void
}) {
  const sentence = `I would like to get tBNB and U on BNB Smart Chain Testnet to my wallet ${address}`
  const [copied, setCopied] = useState(false)
  const [claim, setClaim] = useState<'idle' | 'signing' | 'confirming' | 'done' | 'failed'>('idle')
  const config = useConfig()
  const { writeContractAsync } = useWriteContract()

  const copy = async () => {
    try { await navigator.clipboard.writeText(sentence); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the sentence stays selectable */ }
  }
  const claimU = async () => {
    setClaim('signing')
    try {
      const hash = await writeContractAsync({ address: U_FAUCET_CONTRACT, abi: faucetAbi, functionName: 'requestTokens', chainId: 97 })
      setClaim('confirming')
      await waitForTransactionReceipt(config, { hash, chainId: 97 })
      setClaim('done')
      onDone()
    } catch {
      setClaim('failed')
    }
  }

  return (
    <div className="hs-practice" role="region" aria-label="Get free test tokens">
      <p className="hs-practice-title">Free test tokens for this practice hire</p>
      <div className="hs-practice-step">
        <p>Send this message to BNB Chain&apos;s bot <a href={BOT_URL} target="_blank" rel="noreferrer">@bnbchain_official_bot</a> on Telegram. It sends test BNB for fees and test U for the price.</p>
        <p className="hs-practice-sentence"><code>{sentence}</code></p>
        <span className="hs-practice-actions">
          <Button size="sm" variant="primary" onClick={copy}><Copy aria-hidden="true" />{copied ? 'Copied' : 'Copy message'}</Button>
          <ButtonLink size="sm" href={BOT_URL} external>Open the bot<ArrowUpRight aria-hidden="true" /></ButtonLink>
        </span>
        {needGas ? <p className="hs-practice-fine">Or use the <a href={WEB_FAUCET} target="_blank" rel="noreferrer">web faucet</a> for test BNB (it needs 0.002 BNB on mainnet in the wallet).</p> : null}
      </div>
      {needToken && !needGas ? (
        <div className="hs-practice-step">
          <p>Already have test BNB? Claim 10 test U here from the public U faucet. Your wallet signs one free testnet transaction.</p>
          <span className="hs-practice-actions">
            <Button size="sm" variant="secondary" disabled={claim === 'signing' || claim === 'confirming'} onClick={claimU}>
              {claim === 'signing' ? 'Confirm in your wallet' : claim === 'confirming' ? 'Claiming…' : claim === 'done' ? 'Claimed' : 'Get 10 test U'}
            </Button>
          </span>
          {claim === 'failed' ? <p className="hs-practice-fine">The claim did not go through. Each wallet can claim once every 30 minutes; check again in a moment.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
