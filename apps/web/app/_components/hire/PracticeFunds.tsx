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
 *   - test BNB for fees: BNB Chain's Telegram bot, with the exact sentence its docs give,
 *     the buyer's address filled in; or the web faucet.
 *   - test U for the price: United Stables' public faucet contract (10 test U per claim,
 *     every 30 minutes), claimed by the buyer's own wallet with one plain-words signature.
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
  const sentence = `I would like to get tBNB to my wallet ${address}`
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
      {needGas ? (
        <div className="hs-practice-step">
          <p>1. Test BNB for fees. Send this message to BNB Chain&apos;s bot <a href={BOT_URL} target="_blank" rel="noreferrer">@bnbchain_official_bot</a>:</p>
          <p className="hs-practice-sentence"><code>{sentence}</code></p>
          <span className="hs-practice-actions">
            <Button size="sm" variant="secondary" onClick={copy}><Copy aria-hidden="true" />{copied ? 'Copied' : 'Copy message'}</Button>
            <ButtonLink size="sm" href={WEB_FAUCET} external>Web faucet<ArrowUpRight aria-hidden="true" /></ButtonLink>
          </span>
          <p className="hs-practice-fine">The bot gives up to 0.3 tBNB a day. The web faucet needs 0.002 BNB on mainnet in the wallet.</p>
        </div>
      ) : null}
      {needToken ? (
        <div className="hs-practice-step">
          <p>{needGas ? '2' : '1'}. Test U for the price: claim 10 from the public U faucet. Your wallet signs one free testnet transaction.</p>
          <span className="hs-practice-actions">
            <Button size="sm" variant={needGas ? 'secondary' : 'primary'} disabled={needGas || claim === 'signing' || claim === 'confirming'} onClick={claimU}>
              {claim === 'signing' ? 'Confirm in your wallet' : claim === 'confirming' ? 'Claiming…' : claim === 'done' ? 'Claimed' : 'Get 10 test U'}
            </Button>
          </span>
          {needGas ? <p className="hs-practice-fine">Get test BNB first: the claim needs a tiny fee.</p> : null}
          {claim === 'failed' ? <p className="hs-practice-fine">The claim did not go through. Each wallet can claim once every 30 minutes; check again in a moment.</p> : null}
        </div>
      ) : null}
    </div>
  )
}
