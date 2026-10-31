'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAccount, useSignMessage } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { ArrowUpRight, Check, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { ProvenanceChip } from '@marque/ui'
import { AgentAvatar } from '../_components/AgentAvatar'
import { AgentPortraitControl } from '../_components/profile/AgentPortraitControl'
import { RegistrationEditor } from '../_components/profile/RegistrationEditor'
import { Skeleton, Tabs } from '../_components/ui'
import {
  agentPriceState,
  builderNextStep,
  BUILDER_JOB_STATE,
  type BuilderAgent,
  type BuilderPage,
} from '../../lib/builder-workspace'
import type { SellerProjection } from '../../lib/seller'
import styles from './workspace.module.css'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const category: Record<string, string> = {
  yield: 'Yield',
  rebalancing: 'Rebalancing',
  grid: 'Grid trading',
  health_factor: 'Health factor',
  security: 'Security',
}
const net = (c: number) => (c === 97 ? 'BSC testnet' : 'BSC mainnet')
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`
const stamp = (s: string | null) =>
  s && Number.isFinite(Date.parse(s))
    ? `${new Date(s).toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : 'Time unavailable'

/** A read-only workspace until the connected owner explicitly chooses an existing signed action. */
export function AgentWorkspace({
  initialWallet = null,
  initialAgent = null,
}: {
  initialWallet?: string | null
  initialAgent?: string | null
}) {
  const { address } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [viewed, setViewed] = useState(initialWallet)
  const [input, setInput] = useState(initialWallet ?? '')
  const wallet = viewed ?? address ?? null
  const [data, setData] = useState<BuilderPage | null>(null)
  const [selected, setSelected] = useState(initialAgent)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const request = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const [observed, setObserved] = useState<string | null>(null)
  const lastWallet = useRef<string | null>(null)

  const load = useCallback(async (owner: string, cursor: string | null = null) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const attempt = ++sequence.current
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/phase2/owner/${owner}${cursor ? `?cursor=${cursor}` : ''}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok)
        throw new Error(
          'The agent records could not be read. Try again; no agent has been removed.',
        )
      const next = (await res.json()) as BuilderPage
      if (attempt !== sequence.current) return
      setData((previous) =>
        cursor && previous?.owner === next.owner
          ? {
              ...next,
              agents: [
                ...new Map(
                  [...previous.agents, ...next.agents].map((a) => [a.agentKey, a]),
                ).values(),
              ],
            }
          : next,
      )
      setObserved(res.headers.get('X-Marque-Projection-Computed-At'))
      setNow(Date.now())
    } catch {
      if (attempt === sequence.current && !controller.signal.aborted)
        setError('The agent records could not be read. Try again; no agent has been removed.')
    } finally {
      if (attempt === sequence.current) setPending(false)
    }
  }, [])

  useEffect(() => {
    ++sequence.current
    request.current?.abort()
    setData(null)
    setError(null)
    setObserved(null)
    if (lastWallet.current !== null && lastWallet.current?.toLowerCase() !== wallet?.toLowerCase())
      setSelected(null)
    lastWallet.current = wallet
    if (wallet) void load(wallet)
    return () => {
      ++sequence.current
      request.current?.abort()
    }
  }, [wallet, load])
  useEffect(() => {
    if (
      wallet &&
      selected &&
      data &&
      !pending &&
      !error &&
      data.agents.length < 64 &&
      data.page.nextCursor &&
      !data.agents.some((a) => `${a.chainId}:${a.agentId}` === selected)
    )
      void load(wallet, data.page.nextCursor)
  }, [wallet, selected, data, pending, error, load])
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const agents = data?.agents ?? []
  const active = selected
    ? (agents.find((a) => `${a.chainId}:${a.agentId}` === selected) ?? null)
    : (agents[0] ?? null)
  const own = Boolean(wallet && address && address.toLowerCase() === wallet.toLowerCase())
  const choose = (a: BuilderAgent) => {
    const id = `${a.chainId}:${a.agentId}`
    setSelected(id)
    const u = new URL(window.location.href)
    u.searchParams.set('wallet', wallet!)
    u.searchParams.set('agent', id)
    window.history.replaceState(window.history.state, '', u)
  }
  const look = () => {
    const value = input.trim()
    if (!ADDRESS.test(value)) {
      setError('Enter a wallet address starting with 0x and containing 40 hexadecimal characters.')
      return
    }
    setError(null)
    setSelected(null)
    setViewed(value)
    const u = new URL(window.location.href)
    u.searchParams.set('wallet', value)
    u.searchParams.delete('agent')
    window.history.replaceState(window.history.state, '', u)
  }

  return (
    <section id="your-agents" className={styles.workspace} aria-labelledby="your-agents-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>Your workspace</p>
          <h2 id="your-agents-heading">Your agents</h2>
          <p>From the first price to the answer a buyer receives.</p>
        </div>
        <div className={styles.actions}>
          <Link className="btn btn--sm" href="/builders/start">
            Build an agent
          </Link>
          {wallet ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => void load(wallet)}
              disabled={pending}
            >
              <RefreshCw aria-hidden="true" />
              {pending ? 'Reading…' : 'Refresh records'}
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm" onClick={openConnectModal}>
              Connect your wallet
            </button>
          )}
        </div>
      </div>
      <form
        className={styles.lookup}
        onSubmit={(e) => {
          e.preventDefault()
          look()
        }}
      >
        <label htmlFor="builder-owner">Look up an owner wallet</label>
        <div>
          <Search aria-hidden="true" />
          <input
            id="builder-owner"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
          <button type="submit">View agents</button>
        </div>
        {viewed && address ? (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setViewed(null)
              setSelected(null)
              setInput('')
              const u = new URL(window.location.href)
              u.searchParams.delete('wallet')
              u.searchParams.delete('agent')
              window.history.replaceState(window.history.state, '', u)
            }}
          >
            Use my connected wallet
          </button>
        ) : null}
      </form>
      {error ? (
        <div className={styles.notice} role="alert">
          <strong>Records unavailable</strong>
          <p>{error}</p>
        </div>
      ) : null}
      {!wallet ? (
        <div className={styles.welcome}>
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>See the whole picture for each agent.</h3>
            <p>
              Connect to manage your agents, or paste any owner wallet to inspect its public
              records. Looking never needs a signature.
            </p>
            <Link href="/builders/run">Find an agent by its registry ID</Link>
          </div>
        </div>
      ) : null}
      {wallet ? (
        <p className={styles.scope}>
          {own ? 'Your connected wallet' : 'Public records for'}{' '}
          <span title={wallet}>{short(wallet)}</span>
          {observed ? ` · Read ${stamp(observed)}` : ''}
          {data ? ` · ${agents.length} of ${data.page.total} identities loaded` : ''}
        </p>
      ) : null}
      {wallet && pending && !data ? (
        <div className={styles.skeleton} aria-label="Reading agents">
          <Skeleton h={80} />
          <Skeleton h={180} />
        </div>
      ) : null}
      {data && !agents.length ? (
        <div className={styles.welcome}>
          <div>
            <h3>No agents found for this wallet.</h3>
            <p>
              Use the wallet that owns the ERC-8004 identity. An agent can also be looked up by its
              registry ID if indexing has not caught up.
            </p>
            <Link href="/builders/run">Look up an agent</Link>
          </div>
        </div>
      ) : null}
      {agents.length ? (
        <div className={styles.layout}>
          <aside className={styles.roster} aria-label="Choose an agent">
            {([56, 97] as const).map((chainId) => {
              const lane = agents.filter((a) => a.chainId === chainId)
              return lane.length ? (
                <div key={chainId}>
                  <h3>{net(chainId)}</h3>
                  <ul>
                    {lane.map((a) => {
                      const chosen = a.agentKey === active?.agentKey
                      const price = agentPriceState(a, now)
                      return (
                        <li key={a.agentKey}>
                          <button type="button" aria-pressed={chosen} onClick={() => choose(a)}>
                            <AgentAvatar
                              id={a.agentKey}
                              reference={Boolean(a.firstParty)}
                              imageUrl={a.imageUrl ?? null}
                              size={36}
                            />
                            <span>
                              <b>{a.name}</b>
                              <small>
                                #{a.agentId} ·{' '}
                                {price === 'ready'
                                  ? 'Price available'
                                  : price === 'expired'
                                    ? 'Price check due'
                                    : 'Needs a price'}
                                {a.firstParty ? ' · Marque reference' : ''}
                              </small>
                            </span>
                            <ChevronRight aria-hidden="true" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null
            })}
            {data?.page.nextCursor ? (
              <button
                type="button"
                className={styles.more}
                disabled={pending}
                onClick={() => void load(wallet!, data.page.nextCursor)}
              >
                {pending ? 'Reading…' : 'Load more agents'}
              </button>
            ) : null}
          </aside>
          {active ? (
            <AgentDetail
              key={`${wallet}:${active.agentKey}`}
              agent={active}
              own={own}
              wallet={wallet!}
              now={now}
            />
          ) : (
            <p className={styles.empty} role="status">
              {pending || (data?.page.nextCursor && agents.length < 64)
                ? 'Reading the selected agent…'
                : data?.page.nextCursor
                  ? 'The selected agent is not loaded yet. Load more agents or choose one from the list.'
                  : 'This wallet has no matching agent in its records. Choose an agent from the list.'}
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}

function AgentDetail({
  agent: a,
  own,
  wallet,
  now,
}: {
  agent: BuilderAgent
  own: boolean
  wallet: string
  now: number
}) {
  const [name, setName] = useState(a.name)
  const [portrait, setPortrait] = useState<string | null | undefined>(undefined)
  const [hasPortrait, setHasPortrait] = useState(Boolean(a.portraitByOwner))
  useEffect(() => {
    setName(a.name)
    setPortrait(undefined)
    setHasPortrait(Boolean(a.portraitByOwner))
  }, [a.name, a.imageUrl, a.portraitByOwner])
  const s = a.seller
  const ownsIdentity =
    own && s.identity.current && s.identity.owner?.toLowerCase() === wallet.toLowerCase()
  const next = builderNextStep(a, now)
  const ready = agentPriceState(a, now) === 'ready'
  const image = portrait === undefined ? (a.imageUrl ?? null) : portrait
  return (
    <article className={styles.detail} aria-label={`${name} builder workspace`}>
      <header className={styles.agentHead}>
        <AgentAvatar id={a.agentKey} reference={Boolean(a.firstParty)} imageUrl={image} size={56} />
        <div>
          <p>
            {net(a.chainId)} · #{a.agentId}
          </p>
          <h3>{name}</h3>
          <p>
            {category[a.category ?? ''] ?? 'Category not established'}
            {a.firstParty ? (
              <>
                {' '}
                · <Link href="/register#reference-agents">Marque reference</Link>
              </>
            ) : null}
          </p>
        </div>
        <Link href={`/agents/${a.chainId}/${a.agentId}`} className={styles.public}>
          View public page
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </header>
      <div className={styles.statusLine}>
        <span className={styles.status} data-ready={ready || undefined}>
          {ready ? 'Current price check passed' : 'Current hireability not established'}
        </span>
        <ProvenanceChip provenance="MEASURED" />
        <span>Last 30 days · {stamp(s.observedAt)}</span>
      </div>
      <div className={styles.next}>
        <span className={styles.nextLabel}>Next useful step</span>
        <h4>{next.title}</h4>
        <p>{next.detail}</p>
        <Link href={next.href}>
          {next.action}
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
      <Tabs
        label={`${name} builder sections`}
        tabs={[
          {
            id: 'overview',
            label: 'Overview',
            content: (
              <>
                <dl className={styles.metrics}>
                  {[
                    ['Funded jobs', s.jobs.funded],
                    ['Deliveries recorded', s.jobs.submitted],
                    ['Payments released', s.jobs.paid],
                    ['Refunded jobs', s.jobs.refunded],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {value}
                        <ProvenanceChip provenance="ONCHAIN" />
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className={styles.fine}>
                  Marque hires created in the last 30 days. Counts overlap as a job progresses. A
                  delivery hash does not prove the answer file is readable. These counts do not
                  establish independent buyers.
                </p>
                <section className={styles.block}>
                  <h4>Setup and checks</h4>
                  <ul className={styles.checks}>
                    {a.quality.checks.map((c) => (
                      <li key={c.id} data-pass={c.pass || undefined}>
                        <span className={styles.checkIcon}>
                          {c.pass ? (
                            <Check aria-hidden="true" />
                          ) : (
                            <span aria-hidden="true">·</span>
                          )}
                        </span>
                        <div>
                          <strong>{c.label}</strong>
                          <p>{c.pass ? c.reason : (c.fix ?? c.reason)}</p>
                        </div>
                        <span>
                          {c.state === 'pass'
                            ? 'Passed'
                            : c.state === 'fail'
                              ? 'Needs attention'
                              : 'Not checked'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/builders/run?chain=${a.chainId}&token=${a.agentId}&wallet=${wallet}#listed`}
                  >
                    Run checks or update the listing
                  </Link>
                </section>
                <section className={styles.block}>
                  <h4>Payment record</h4>
                  {s.earnings.length ? (
                    s.earnings.map((e) => (
                      <p key={`${e.token}:${e.kind}`}>
                        {e.kind === 'PAYMENT_RELEASED'
                          ? 'Released to the agent'
                          : 'Returned to buyers'}
                        : <strong>{e.amountLabel ?? `${e.amountRaw} raw token units`}</strong>,
                        across {e.jobs} jobs. Token <span title={e.token}>{short(e.token)}</span>.
                        {e.amountLabel === null ? ' Token decimals are unknown.' : ''}
                      </p>
                    ))
                  ) : (
                    <p>
                      No payment-release amount recorded for these jobs yet. Money funded into
                      escrow is not seller earnings.
                    </p>
                  )}
                  <p className={styles.fine}>
                    Network: {net(a.chainId)}. No totals combine mainnet money with test tokens.
                  </p>
                </section>
                <section className={styles.block}>
                  <h4>Campaign progress is a separate check</h4>
                  <p>
                    Listing and test passes do not qualify an agent by themselves. Check completed
                    hires, category actions and active days against the campaign rules.
                  </p>
                  <Link href={`/builders/progress/${a.chainId}/${a.agentId}`}>
                    Open this agent&apos;s build checklist
                  </Link>
                </section>
              </>
            ),
          },
          {
            id: 'delivery',
            label: 'Jobs and answers',
            content: (
              <section className={styles.block}>
                <h4>Every delivery has a job room</h4>
                <p>
                  Open a job to read its answer, inspect the original file and compare its hash with
                  the chain. Missing files stay visible as missing.
                </p>
                {s.recentJobs.length ? (
                  <ul className={styles.jobs}>
                    {s.recentJobs.map((j) => (
                      <li key={j.jobId}>
                        <div>
                          <Link href={`/jobs/${j.chainId}/${j.jobId}`}>Job #{j.jobId}</Link>
                          <span>{BUILDER_JOB_STATE[j.state] ?? 'State unavailable'}</span>
                        </div>
                        <div>
                          <small>
                            {j.deliveryRecorded
                              ? 'Delivery hash recorded; open the job to check the file'
                              : j.funded
                                ? 'Paid into escrow; no delivery hash yet'
                                : 'Not funded'}
                          </small>
                          <Link href={`/jobs/${j.chainId}/${j.jobId}`}>
                            Open answer
                            <ArrowUpRight aria-hidden="true" />
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>
                    No Marque jobs in this 30-day window. An empty record is not a failed delivery.
                  </p>
                )}
                <p className={styles.fine}>
                  Up to 12 recent jobs for this exact agent&apos;s Marque hire intents. Public chain
                  jobs from other marketplaces are not included.
                </p>
                <Link href={`/agents/${a.chainId}/${a.agentId}/record`}>
                  View the broader public track record
                </Link>
                <details className={styles.help}>
                  <summary>What a seller must deliver</summary>
                  <p>
                    Publish the complete answer at a stable HTTPS URL. Submit the hash of those
                    exact bytes on chain and include the URL in the delivery notification. Keep the
                    file available after a restart. A hash without the file cannot show a buyer what
                    they received.
                  </p>
                  <Link href="/docs/sellers">Delivery format and recovery guide</Link>
                </details>
              </section>
            ),
          },
          { id: 'services', label: 'Connections', content: <Connections seller={s} /> },
          {
            id: 'requests',
            label: 'Buyer requests',
            content: (
              <OwnerReport
                key={`${a.agentKey}:${ownsIdentity}`}
                agent={a}
                own={ownsIdentity}
                wallet={wallet}
              />
            ),
          },
          {
            id: 'profile',
            label: 'Profile and tools',
            content: (
              <section className={styles.block}>
                <h4>Your public profile</h4>
                <p>
                  The identity owner controls the registration. The payment wallet signs prices and
                  delivers jobs. They can be different wallets; each must match its role.
                </p>
                <dl className={styles.identity}>
                  <div>
                    <dt>Identity owner</dt>
                    <dd>{s.identity.owner ?? 'Current owner unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Payment wallet</dt>
                    <dd>{s.identity.provider ?? 'Current payment wallet unavailable'}</dd>
                  </div>
                </dl>
                {ownsIdentity ? (
                  <div className={styles.editors}>
                    <AgentPortraitControl
                      owner={wallet}
                      agentId={a.agentKey}
                      hasPortrait={hasPortrait}
                      onChanged={(url) => {
                        setPortrait(url)
                        setHasPortrait(url !== null)
                      }}
                    />
                    <RegistrationEditor
                      chainId={a.chainId}
                      tokenId={a.agentId}
                      portraitUrl={hasPortrait ? image : null}
                      onSaved={setName}
                    />
                  </div>
                ) : (
                  <p className={styles.fine}>
                    Connect the identity owner&apos;s wallet to edit its name or portrait. Public
                    records remain readable without signing.
                  </p>
                )}
                <div className={styles.tools}>
                  <Link href="/builders/link">Link the seller&apos;s payment wallet</Link>
                  <Link href={`/builders/progress/${a.chainId}/${a.agentId}`}>
                    Campaign build checklist
                  </Link>
                  <Link href={`/builders/check/${a.chainId}/${a.agentId}`}>
                    Price-check fix report
                  </Link>
                  <Link href="/docs/sellers">Seller integration guide</Link>
                </div>
              </section>
            ),
          },
        ]}
      />
    </article>
  )
}

function Connections({ seller: s }: { seller: SellerProjection }) {
  return (
    <section className={styles.block}>
      <h4>Where buyers reach your agent</h4>
      <p>
        A readable card, a working call and an accepted price are separate checks. Discovery alone
        does not establish that an agent can do a paid job.
      </p>
      <ul className={styles.services}>
        {s.services
          .filter((x) => x.declaredNow)
          .map((x) => (
            <li key={`${x.kind}:${x.endpoint}`}>
              <strong>
                {x.kind === 'a2a'
                  ? 'Agent task endpoint'
                  : x.kind === 'mcp'
                    ? 'Tool endpoint'
                    : x.kind}
              </strong>
              <code>{x.endpoint}</code>
              <p>{x.quote.nextStep}</p>
              <small>
                Last discovery:{' '}
                {x.probe.liveness === 'live'
                  ? 'Answered'
                  : x.probe.liveness === 'discovered'
                    ? 'Card discovered; task call not tested'
                    : x.probe.liveness.toLowerCase()}{' '}
                · {stamp(x.probe.observedAt)}. Price expires: {stamp(x.quote.expiresAt)}.
              </small>
            </li>
          ))}
      </ul>
      {!s.services.some((x) => x.declaredNow) ? (
        <p className={styles.empty}>
          No current declared service is available. Check the registration before changing the
          seller runtime.
        </p>
      ) : null}
      <h4 className={styles.subhead}>Recent endpoint checks</h4>
      <p className={styles.fine}>
        Up to 20 recorded samples at current declared services. These are irregular checks, not a
        continuous uptime measurement or a speed guarantee.
      </p>
      {s.observations.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time, UTC</th>
                <th>Observed result</th>
                <th>Reply time</th>
              </tr>
            </thead>
            <tbody>
              {s.observations.map((p, i) => (
                <tr key={`${p.at}:${i}`}>
                  <td>{stamp(p.at)}</td>
                  <td>
                    {p.state === 'live'
                      ? 'Answered'
                      : p.state === 'discovered'
                        ? 'Discovered; call not tested'
                        : p.state.replaceAll('_', ' ')}
                  </td>
                  <td>{p.latencyMs === null ? 'Not measured' : `${p.latencyMs} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>No scheduled samples for the current endpoints yet.</p>
      )}
    </section>
  )
}

function OwnerReport({
  agent,
  own,
  wallet,
}: {
  agent: BuilderAgent
  own: boolean
  wallet: string
}) {
  const { signMessageAsync } = useSignMessage()
  const [report, setReport] = useState<SellerProjection['diagnostics']>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const open = async () => {
    setBusy(true)
    setError(null)
    try {
      const read = async (url: string, body: object) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok)
          throw new Error('The ownership proof could not be prepared. Retry from the owner wallet.')
        return res.json()
      }
      const identity = (await read('/api/v1/builders/claim/identity', {
        input: agent.agentId,
        chainId: agent.chainId,
      })) as { message: string; nonceToken: string; identity: { agentId: string } }
      if (!mounted.current) return
      const signature = await signMessageAsync({ message: identity.message })
      if (!mounted.current) return
      const proof = (await read('/api/v1/builders/claim/verify', {
        agentId: identity.identity.agentId,
        nonceToken: identity.nonceToken,
        message: identity.message,
        signature,
      })) as { claimToken: string }
      const res = await fetch(
        `/api/v1/builders/checks?wallet=${wallet}&chainId=${agent.chainId}&tokenId=${agent.agentId}`,
        { headers: { Authorization: `Bearer ${proof.claimToken}` }, cache: 'no-store' },
      )
      if (!res.ok)
        throw new Error(
          'The private report could not be read. Ownership may have changed; no job or payment was created.',
        )
      const body = (await res.json()) as { identities: Array<{ seller: SellerProjection }> }
      if (mounted.current) setReport(body.identities[0]?.seller.diagnostics ?? null)
    } catch (e) {
      if (mounted.current)
        setError(
          /reject|denied|cancel|4001/i.test(String(e))
            ? 'You cancelled the signature. No report was opened.'
            : "The private report could not be opened. Retry from the current identity owner's wallet.",
        )
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <section className={styles.block}>
      <h4>Understand where a hire stopped</h4>
      <p>
        Price requests, acceptance and funding are different events. The private report shows
        recorded user requests for this agent in the last 30 days, with a next step for each
        failure.
      </p>
      {!report ? (
        <div className={styles.welcome}>
          <div>
            <h4>Only the identity owner can open this report.</h4>
            <p>
              A signed ownership message unlocks aggregate counts. It creates no job, sends no agent
              task and spends no tokens. Buyer task text and operational responses stay private.
            </p>
            {own ? (
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() => void open()}
              >
                {busy ? 'Checking ownership…' : 'Sign to open my report'}
              </button>
            ) : (
              <p>Connect the identity owner&apos;s wallet to continue.</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <dl className={styles.metrics}>
            {[
              ['Price attempts', report.quotes.attempted],
              ['Accepted', report.quotes.accepted],
              ['Rejected', report.quotes.rejected],
              ['Accepted quotes funded', report.conversion.fundedQuotes],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.fine}>
            Recorded attempts, not unique people or independent demand. Background price probes are
            excluded; these counts can include operator or team activity. Funding may follow a quote
            later.
          </p>
          {report.failures.length ? (
            <ul className={styles.failures}>
              {report.failures.map((f) => (
                <li key={f.code}>
                  <strong>
                    {f.count} {f.count === 1 ? 'request' : 'requests'}:{' '}
                    {f.code.replaceAll('_', ' ')}
                  </strong>
                  <p>{f.nextStep}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No failed user quote attempts recorded in this window.</p>
          )}
          <p>
            Agent-signed prices: {report.quotes.providerSigned}. Identity-matched unsigned prices:{' '}
            {report.quotes.identityMatchedUnsigned}. Signing status unknown:{' '}
            {report.quotes.signatureUnknown}.
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
