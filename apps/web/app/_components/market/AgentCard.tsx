'use client'
import { ExecutionChips } from '../charters/ExecutionChips'
import { Check } from 'lucide-react'
import { useAgentTerms } from '../terms/useTerms'
import { TermsLine } from '../terms/TermsLine'
import { AgentAvatar } from '../AgentAvatar'
import { SaveStar } from '../SaveStar'
import { Badge } from '../ui'
import { avatarSource } from '../../../lib/avatar-source'
import { utcDay } from '../../../lib/time'
import { referenceAgentByToken } from '../../../lib/reference-agents'
import {
  CATEGORY_LABEL, answersFree, deliveryWords, describe, hireBlocked, hireHref,
  profileHref, tryHref, warrantIsStale, type MarketRow,
} from '../../register/market-model'
import styles from './AgentCard.module.css'
import { statedPriceDiffers, statedPriceWords } from '../../../lib/stated-price'

/**
 * The marketplace card (DESIGN-SYSTEM.md 8.3, simplified 28 Sep). Two axes, never
 * merged: can a wallet hire it right now, and has it passed Marque's published test.
 * Everything else is three figures with their source in words (a live quote or a
 * declared price, a median over paid jobs, verified buyers), so the card reads in one
 * pass. A third party that failed the test still carries Hire; the failure is named.
 *
 * `feature` is the home page's larger card: the portrait on a stage made from its own
 * image, blurred. Same facts, same order.
 */
const TONE: Record<string, string> = { yield: 'yield', grid: 'grid', rebalancing: 'rebalancing', health_factor: 'health', security: 'security' }

export function AgentCard({ a, compare, base = '', variant = 'default' }: {
  a: MarketRow
  /** The marketplace's compare toggle, when the card sits in a comparable list. */
  compare?: { picked: boolean; atLimit: boolean; onToggle: (a: MarketRow) => void }
  /** Path the hire sheet opens over (the home page passes "/"). */
  base?: string
  variant?: 'default' | 'feature'
}) {
  const feature = variant === 'feature'
  const profile = profileHref(a)
  // One price source for every surface (invariant 41): fresh, dated with its age, or none.
  const { terms, now, refresh, refreshing } = useAgentTerms(a.agentId, a.commerce)
  const hireable = terms.state === 'fresh'
  const quoted = terms.state !== 'none'
  const declared = !quoted && a.priceProvenance === 'CLAIMED' ? a.price : null
  const w = a.warrant
  const st = a.standing
  // Try free only when the agent answered Marque's probe recently (2 Nov). Buyer-linked ratings stay on untested agents:
  // they come from wallets that paid for a delivered job, and the card says beside them that they are not a test result.
  const free = answersFree(a) && (w.status !== 'untested' || a.liveness === 'live')
  const untested = w.status === 'untested'
  const classified = a.category && a.category !== 'unclassified'
  const cat = classified ? CATEGORY_LABEL[a.category!] ?? a.category! : 'Other'
  const blurb = describe(a)
  // Price truth (2 Nov): the agent's own stated price or rail, when it differs from the quote the hire will charge.
  const own = statedPriceDiffers(a.identity.description, terms.priceLabel ?? null)
  const verified = a.track.verified
  const delivery = deliveryWords(a.track.delivery.medianSeconds)
  const stale = w.status === 'warranted' && warrantIsStale(w.date)
  // The practice lane (BSC testnet) uses the same card; only a dashed network badge differs.
  const practice = a.agentId.startsWith('97:')
  // All-networks view: one card per agent; the line says where it sells and the hire sheet picks the network.
  const both = a.networks?.includes(56) && a.networks?.includes(97)
  const twin = !a.networks && !practice && a.isReference ? referenceAgentByToken(a.agentId)?.erc8004Testnet ?? null : null
  const art = avatarSource({ id: a.agentId, reference: a.isReference, imageUrl: a.identity.imageUrl, size: 512 })

  return (
    <article className={styles.card} data-cat={classified ? TONE[a.category!] : undefined} data-variant={variant} data-agent={a.agentId} data-hireable={hireable || undefined} data-picked={compare?.picked || undefined}>
      {feature ? (
        <div className={styles.cover} aria-hidden="true" data-kind={art.kind}>
          <span className={styles.coverEmblem}><AgentAvatar id={a.agentId} name={a.name} category={a.category} reference={a.isReference} imageUrl={a.identity.imageUrl} size={72} /></span>
          {art.src ? <span className={styles.coverArt} style={{ backgroundImage: `url("${art.src}")` }} /> : null}
        </div>
      ) : null}

      <header className={styles.head}>
        {feature ? null : (
          <span className={styles.portrait}>
            <AgentAvatar id={a.agentId} name={a.name} category={a.category} reference={a.isReference} imageUrl={a.identity.imageUrl} size={52} />
          </span>
        )}
        <div className={styles.title}>
          <h3 className={styles.name}>
            {profile ? <a href={profile} className={styles.nameLink}>{a.name}</a> : a.name}
          </h3>
          <span className={styles.where}>
            <span className={styles.mark} data-tone={classified ? TONE[a.category!] : 'other'} aria-hidden="true" />
            {cat}
            {a.identityCount > 1 && !classified ? <span className={styles.count}> · {a.identityCount} identities</span> : null}
            {both ? (
              <span className={styles.nets} title="Hire on BSC mainnet with real money, or on BSC testnet free" aria-label="On mainnet and testnet">
                <span data-net="main">Mainnet</span><span data-net="test">Testnet</span>
              </span>
            ) : practice ? (
              <span className={styles.nets} title="BSC testnet: test tokens, no real value">
                <span data-net="test">{a.networks ? 'Testnet only' : 'Testnet'}</span>
              </span>
            ) : null}
          </span>
          {a.builtOutside ? <span className={styles.outside} title="Listed on Marque by its own builder, a wallet outside the Marque team">Built by an outside builder</span> : null}
        </div>
        {a.isReference ? <a href="/register#reference-agents" className={styles.ref} title="Why Marque runs its own agents"><Badge kind="reference" /></a> : null}
        <SaveStar agentId={a.agentId} name={a.name} chainId={practice ? 97 : 56} tokenId={a.tokenId} />
      </header>

      {blurb ? <p className={styles.blurb}>{blurb}</p> : <p className={styles.blurbNone}>No description published.</p>}

      <p className={styles.status}>
        {hireable
          ? <span className={styles.ok}><span className={styles.dot} aria-hidden="true" />Live price</span>
          : terms.state === 'dated'
            ? <span className={styles.off}>Quote lapsed</span>
            : <span className={styles.off}>{a.commerce.state === 'preview_only' || free ? 'Preview only' : 'Not hireable'}</span>}
        <span className={styles.sep} aria-hidden="true" />
        {st?.pulled
          ? <span className={styles.failed} title={`${st.pulled.text}. Out of the hireable count until a later check agrees.`}>Pulled: {st.pulled.reason === 'undelivered' ? 'paid job undelivered' : 'wrong answer'}</span>
          : w.status === 'warranted' && w.date
          ? stale ? <span className={styles.retest}>Retest due</span> : <span className={styles.warrant}><Check aria-hidden="true" />Test passed {utcDay(w.date)}</span>
          : st?.warranted
            ? <span className={styles.warrant} title="Its mainnet identity, same owner and endpoint, passed Marque's published test"><Check aria-hidden="true" />Test passed on mainnet {utcDay(st.warranted.at)}</span>
          : st?.checked
            ? <span className={styles.warrant} title={`An answer${st.checked.via === 'job' ? ' in a paid job' : st.checked.via === 'test' ? ' to its published test' : ' to Marque\'s daily check call'} agreed with BNB Chain${st.checked.onMainnet ? ' (its mainnet identity)' : ''}. Not a test pass.`}><Check aria-hidden="true" />Checked {utcDay(st.checked.at)}</span>
          : w.status === 'failed'
            ? <span className={styles.failed} title={`Failed ${w.testId ?? 'MCS'}${w.failedField ? ` on ${w.failedField}` : ''}${w.date ? `, ${utcDay(w.date)}` : ''}. The record is on its page.`}>Failed {w.testId ?? 'the test'}</span>
            : w.noFit
              ? <span className={styles.untested} title={`Its category's published test${w.testId ? ` (${w.testId})` : ''} asks about a different job than the one this agent describes.`}>No Marque test fits this agent yet</span>
            : w.format
              ? <span className={styles.untested} title={`Its answer to ${w.testId ?? 'the test'}${w.date ? ` on ${utcDay(w.date)}` : ''} did not use the test's fields. Counts as untested, not as a wrong answer.`}>Answer not in the test&apos;s format</span>
              : <span className={styles.untested}>{a.category === 'security' || !a.category || a.category === 'unclassified' ? 'No test for its category yet' : 'Not yet tested'}</span>}
      </p>

      <ExecutionChips executions={a.charterExecutions} />
      <dl className={styles.stats} title={a.track.computedAt ? `Job and review index observed ${a.track.computedAt}${a.track.sourceStale ? ' (cached, refresh pending)' : ''}` : 'Index observation time unavailable'}>
        <div>
          <dt>Price</dt>
          <dd className={terms.state === 'fresh' ? styles.live : styles.claimed} data-terms={terms.state}>{terms.priceLabel ?? declared ?? 'No current price'}</dd>
          <dd className={styles.src}>{quoted ? <TermsLine terms={terms} now={now} refresh={refresh} refreshing={refreshing} short /> : declared ? 'declared, not quoted' : 'not quoted yet'}</dd>
          {own ? <dd className={styles.src} title="What the agent's own registry description says. The hire charges the live quote on BNB Chain's ERC-8183 escrow.">Its own card: {statedPriceWords(own)}</dd> : null}
        </div>
        <div>
          <dt>Delivers</dt>
          <dd>{delivery ?? (a.latencyMs !== null ? `${a.latencyMs} ms` : a.track.available === false ? 'Unavailable' : 'No delivery samples')}</dd>
          <dd className={styles.src}>{delivery ? `median, ${a.track.delivery.samples} escrow-funded` : a.latencyMs !== null ? 'probe reply' : a.track.available === false ? 'job evidence unavailable' : 'no delivery samples'}</dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>{verified.averageStars !== null && verified.count > 0 ? <>{verified.averageStars.toFixed(1)}<span className={styles.star} aria-hidden="true">★</span></> : <span className={styles.none}>{a.track.available === false ? 'Unavailable' : 'Not yet'}</span>}</dd>
          <dd className={styles.src}>{verified.count > 0 ? `${verified.count} linked ${verified.count === 1 ? 'review' : 'reviews'}${untested ? ', not a test result' : ''}` : a.track.available === false ? 'rating evidence unavailable' : 'no linked reviews'}</dd>
        </div>
      </dl>

      <footer className={styles.actions}>
        {compare ? (
          <label className={styles.compare} data-disabled={(!compare.picked && compare.atLimit) || undefined}>
            <input type="checkbox" checked={compare.picked} disabled={!compare.picked && compare.atLimit} onChange={() => compare.onToggle(a)} />
            <span className={styles.compareBox} aria-hidden="true"><Check /></span>
            Compare
          </label>
        ) : <span />}
        <span className={styles.buttons}>
          {free ? <a className={`btn btn--sm btn--quiet ${styles.try}`} href={`${base}${tryHref(a)}`}>Try free</a> : null}
          {hireable
            ? <a className="btn btn--sm btn--hire" href={`${base}${hireHref(a)}`}>Hire</a>
            : terms.state === 'dated'
              ? <a className="btn btn--sm" href={`${base}${hireHref(a)}`} title="Opens the hire sheet, which asks for a fresh price for your task">Hire</a>
              : profile ? <a className="btn btn--sm" href={profile} title={hireBlocked(a)}>View record</a> : null}
        </span>
      </footer>
      {twin ? <p className={styles.twin}><a href={`/agents/97/${twin.tokenId}`}>Also on testnet, free</a></p> : null}
      {terms.state === 'none' ? <p className={styles.why}>{terms.reason ?? `${hireBlocked(a)}.`}</p> : null}
    </article>
  )
}
