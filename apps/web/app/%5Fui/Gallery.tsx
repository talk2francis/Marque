'use client'
import { useState } from 'react'
import { Chip, EvidenceDrawer, MeasureRule, ProvenanceChip, Statement } from '@marque/ui'
import {
  AddressChip, Badge, Button, ButtonLink, Disclosure, Drawer, EmptyState, ErrorNote, ErrorState, Field, HashChip,
  IconButton, Kpi, Modal, PriceTag, QuestProgress, QuestTracker, SectionHead, SelectField, Sheet, Skeleton,
  StarInput, Stars, Tabs, Tape, Tooltip, TxStepper, type TxStep,
} from '../_components/ui'
import { toast } from '../../lib/toast'
import { Info, Plus, Settings } from 'lucide-react'
import styles from './ui.module.css'

// Real values: mainnet smoke job 56810 (Keel), its wallet and txs (docs/phase2/evidence/mainnet-smoke.json).
const WALLET = '0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452'
const ESCROW = '0xea4daa3100a767e86fded867729ae7446476eba6'
const FUND_TX = '0x767be68f1e6c4c4e678679d68dcf0f703d5d6a30e8fb351fda7b47b71814f046'
const JOB_TXS = ['0xfa59181e5765c1b24f7b8db1efa4b3b86591f600d8e903b051126943b90989dc', '0x930a3bf80f6d43012b581b0cd999c6e3c9c27a8ec11d4c0c0bcc3ba69ea30db8', '0x6ced5a2bb6caa19a812e6c5086dd5e9686ad4467f9e81245298260246ed3938a', '0xd1e45df3a05db4e2b68f491a7309d3a846b41bdd02abee457da6009c98dda67b', '0x767be68f1e6c4c4e678679d68dcf0f703d5d6a30e8fb351fda7b47b71814f046']

function Story({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={styles.story} aria-labelledby={id}>
      <SectionHead id={id} label={title} note={note} />
      <div className={styles.storyBody}>{children}</div>
    </section>
  )
}

const STEP_LABELS = ['Open the job', 'Attach buyer protection', 'Lock the price at 0.05 U', 'Allow exactly 0.05 U', 'Pay 0.05 U into escrow', 'Tell Keel to start']

function stepsAt(n: number, failed: boolean): TxStep[] {
  return STEP_LABELS.map((label, i) => {
    const offchain = i === 5
    if (i === 3 && n > 3) return { id: String(i), label, state: 'skipped', detail: 'Your allowance already covers this price.' }
    if (i < n) return { id: String(i), label, state: 'done', offchain, ...(offchain ? {} : { txHash: JOB_TXS[i], chainId: 56 }) }
    if (i === n) {
      if (failed) return { id: String(i), label, state: 'failed', error: { title: 'You declined the request in your wallet.', action: 'Nothing was sent. Continue when you are ready.' } }
      return { id: String(i), label, state: n % 2 === 0 ? 'wallet' : 'confirming', offchain, ...(n % 2 === 1 ? { txHash: JOB_TXS[i], chainId: 56 } : {}) }
    }
    return { id: String(i), label, state: 'waiting', offchain }
  })
}

export function Gallery() {
  const [step, setStep] = useState(2)
  const [failed, setFailed] = useState(false)
  const [amount, setAmount] = useState('0.05')
  const [addr, setAddr] = useState('')
  const [cat, setCat] = useState('health_factor')
  const [stars, setStars] = useState<number | null>(4)
  const [sheet, setSheet] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [modal, setModal] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <div className={styles.gallery}>
      <Story id="buttons" title="Button" note="Primary is brass: the one action a screen is for">
        <div className={styles.inline}>
          <Button variant="primary">Hire Keel</Button>
          <Button>Try free</Button>
          <Button variant="ink">Continue in wallet</Button>
          <Button variant="quiet">Show the graveyard</Button>
          <Button variant="danger">Cancel job</Button>
          <Button disabled>Unavailable</Button>
          <Button variant="primary" loading={loading} onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1600) }}>Pay 0.05 U into escrow</Button>
        </div>
        <div className={styles.inline}>
          <Button size="sm">Small</Button>
          <Button size="lg" variant="primary">Start the Set and Earn quest</Button>
          <ButtonLink href="#buttons">A link as a button</ButtonLink>
          <IconButton label="Settings"><Settings /></IconButton>
          <IconButton label="Add" bare><Plus /></IconButton>
        </div>
      </Story>

      <Story id="badges" title="Pill / Badge" note="State in words, never colour alone">
        <div className={styles.inline}>
          <Badge kind="hireable" />
          <Badge kind="preview" />
          <Badge kind="warranted" date="2026-09-26" />
          <Badge kind="untested" />
          <Badge kind="retest" />
          <Badge kind="reference" />
          <Badge kind="network" label="BSC mainnet · 56" />
        </div>
        <div className={styles.inline}>
          <Badge kind="failed" test="MCS-HF-1" field="repayToTarget" date="2026-09-26" />
        </div>
        <div className={styles.inline}>
          <ProvenanceChip provenance="ONCHAIN" /><ProvenanceChip provenance="MEASURED" /><ProvenanceChip provenance="TESTED" /><ProvenanceChip provenance="CLAIMED" />
          <Chip tone="holds">In range</Chip><Chip tone="watch">Near the edge</Chip><Chip tone="breach">Close to liquidation</Chip><Chip tone="chain">BSC · 56</Chip>
        </div>
      </Story>

      <Story id="price" title="PriceTag" note="A signed quote counts down (MEASURED); a declared price says so (CLAIMED)">
        <div className={styles.inline} style={{ gap: 48 }}>
          <PriceTag amount="0.05" token="U" source={{ kind: 'quote', expiresAt: Date.now() + 12 * 60_000 + 41_000 }} />
          <PriceTag amount="0.10" token="USDT" source={{ kind: 'declared' }} />
          <PriceTag amount="0.15" token="U" size="m" source={{ kind: 'quote', expiresAt: Date.now() - 1000 }} />
        </div>
      </Story>

      <Story id="stepper" title="TxStepper" note="Named steps; the list keeps its height as states change">
        <div className={styles.split}>
          <div className={styles.chamberCard} data-surface="chamber">
            <TxStepper steps={stepsAt(step, failed)} onRetry={() => setFailed(false)} />
          </div>
          <div className={styles.controls}>
            <span className="t-label">Drive it</span>
            <div className={styles.inline}>
              <Button size="sm" onClick={() => { setFailed(false); setStep((s) => Math.max(0, s - 1)) }}>Back</Button>
              <Button size="sm" onClick={() => { setFailed(false); setStep((s) => Math.min(6, s + 1)) }}>Next step</Button>
              <Button size="sm" variant="danger" onClick={() => setFailed(true)}>Fail this step</Button>
            </div>
            <p className={styles.note}>Step {Math.min(step + 1, 6)} of 6. Even steps wait in the wallet, odd ones confirm with a transaction link. Allowance shows as skipped once passed, with why.</p>
            <span className="t-label" style={{ marginTop: 16 }}>Batch mode (EIP-5792)</span>
            <div className={styles.chamberCard} data-surface="chamber">
              <TxStepper steps={[
                { id: 'a', label: 'Open the job', state: 'done', txHash: JOB_TXS[0], chainId: 56 },
                { id: 'b', label: 'Confirm protection, price and payment (one signature)', state: 'wallet', calls: ['Attach buyer protection', 'Lock the price at 0.05 U', 'Allow exactly 0.05 U', 'Pay 0.05 U into escrow'] },
                { id: 'c', label: 'Tell Keel to start', state: 'waiting', offchain: true },
              ]} />
            </div>
          </div>
        </div>
      </Story>

      <Story id="errors" title="ErrorMap" note="Mapped sentence and next step; never raw text">
        <div className={styles.stack}>
          <ErrorNote error={{ title: 'Your wallet is on another network.', action: 'Switch to BNB Smart Chain to continue.' }} action={<Button size="sm">Switch network</Button>} />
          <ErrorNote error={{ title: 'You need 0.05 U and have 0.02.', action: 'Swap USDT to U on PancakeSwap, then come back.' }} action={<ButtonLink size="sm" href="https://pancakeswap.finance/swap" external>Get U</ButtonLink>} />
        </div>
      </Story>

      <Story id="fields" title="Field" note="Numbers right-aligned with the token; text left">
        <div className={styles.grid3}>
          <Field label="Amount" note="Balance 2.10 U" value={amount} onChange={setAmount} unit="U" action={{ label: 'Max', onClick: () => setAmount('2.10') }} help="Exactly this is approved. Nothing more." />
          <Field label="Wallet to check" kind="mono" value={addr} onChange={setAddr} placeholder="0x…" error={addr && !/^0x[0-9a-fA-F]{40}$/.test(addr) ? 'That is not a BNB Smart Chain address. It starts 0x and has 40 more characters.' : null} help="Any address; yours by default." />
          <SelectField label="Category" value={cat} onChange={setCat} options={[{ value: 'yield', label: 'Yield' }, { value: 'grid', label: 'Grid' }, { value: 'rebalancing', label: 'Rebalancing' }, { value: 'health_factor', label: 'Health factor' }]} />
        </div>
      </Story>

      <Story id="kpi" title="Kpi and Stars" note="No number without its source">
        <div className={styles.grid4}>
          <Kpi label="Hireable in Yield" value="3" provenance="MEASURED" delta="Tidemark joined 26 Sep" deltaTone="up" />
          <Kpi label="Review window" value="7" unit="days" provenance="ONCHAIN" />
          <Kpi label="Delivered in" value="21" unit="s" provenance="ONCHAIN" />
          <Kpi label="Settled" value={null} provenance="ONCHAIN" missing="First settle due 3 Oct" />
        </div>
        <div className={styles.inline} style={{ marginTop: 24 }}>
          <Stars value={4.8} count={23} />
          <Stars value={null} count={0} />
          <StarInput value={stars} onChange={setStars} />
        </div>
      </Story>

      <Story id="chips" title="AddressChip / HashChip" note="Middle truncation, copy, explorer on the right network">
        <div className={styles.inline}>
          <AddressChip value={WALLET} chainId={56} label="You" />
          <AddressChip value={ESCROW} chainId={56} label="Escrow" />
          <HashChip value={FUND_TX} chainId={56} />
          <HashChip value={FUND_TX} chainId={97} label="Testnet" />
        </div>
      </Story>

      <Story id="quest" title="QuestTracker" note="States come from the Quest API only">
        <QuestTracker steps={[
          { key: 'y', name: 'Yield', state: 'done', detail: <>Sluicegate · 0.10 U · rated 5 of 5</>, actions: <Button size="sm">View job</Button> },
          { key: 'g', name: 'Grid', state: 'waiting', detail: <>Lattice · payment confirming · <a href="https://bscscan.com/tx/0x046832487aad390b059110a9abaafebdc36ac835a6444005a271728c52154412">0x0468…4412</a></> },
          { key: 'r', name: 'Rebalancing', state: 'next', detail: <>Recommended: Bound · 0.15 U</>, actions: <><Button size="sm" variant="primary">Hire</Button><Button size="sm" variant="quiet">See all 4</Button></> },
          { key: 'h', name: 'Health factor', state: 'todo', detail: <>Recommended: Keel · 0.05 U</>, actions: <Button size="sm">Hire</Button> },
          { key: 'l', name: 'List your agent', state: 'todo', detail: <>0 of 5 checks passed</>, actions: <Button size="sm">Start</Button> },
        ]} />
        <div className={styles.inline} style={{ marginTop: 20 }}>
          <QuestProgress states={['done', 'waiting', 'todo', 'todo', 'todo']} />
          <QuestProgress states={['done', 'done', 'done', 'done', 'todo']} />
        </div>
      </Story>

      <Story id="tape" title="Tape" note="Real hires only; absent when empty. These five are the mainnet smoke hires">
        <Tape items={[
          { id: '1', kind: 'hire', agent: 'Sluicegate', category: 'Yield', value: '0.10 U', tx: '0x34f1567abb26b7bf2497809489ffbc801f68dc6917b1313def6485092b4958b1', href: '/jobs/56/56806', age: '1d' },
          { id: '2', kind: 'hire', agent: 'Tidemark', category: 'Yield', value: '0.10 U', tx: '0x5dc97243f34d4d2ebe8d7f64574e986f02f40ea7bc526c237fae64f3074247de', href: '/jobs/56/56807', age: '1d' },
          { id: '3', kind: 'hire', agent: 'Lattice', category: 'Grid', value: '0.10 U', tx: '0x046832487aad390b059110a9abaafebdc36ac835a6444005a271728c52154412', href: '/jobs/56/56808', age: '1d' },
          { id: '4', kind: 'hire', agent: 'Bound', category: 'Rebalancing', value: '0.15 U', tx: '0x6feee514ded3e57ca37414f6624e5e24e88d8cb803356ff91a254aabb496dc7e', href: '/jobs/56/56809', age: '1d' },
          { id: '5', kind: 'rating', agent: 'Keel', category: 'Health factor', value: '3 of 5', tx: '0x9f5941b912347d8d5a1f84e789737b4b829f5abfed952b71c3bad64a925d3a08', href: '/jobs/56/56810', age: '1d' },
        ]} />
      </Story>

      <Story id="states" title="Skeleton / EmptyState / ErrorState" note="Final geometry; what belongs here; what changed">
        <div className={styles.grid3}>
          <div className={styles.stack}>
            <Skeleton w={140} h={11} />
            <Skeleton h={30} w="70%" />
            <Skeleton h={14} />
            <Skeleton h={14} w="85%" />
            <Skeleton h={42} w={160} r={8} />
          </div>
          <EmptyState title="No jobs yet" action={<Button size="sm" variant="primary">Start the quest</Button>}>Hires you pay for appear here with every step read from the chain.</EmptyState>
          <ErrorState source="The Quest Index" action={<Button size="sm">Try again</Button>} />
        </div>
      </Story>

      <Story id="disclosure" title="Disclosure, Tabs, Tooltip">
        <div className={styles.split}>
          <div>
            <Disclosure summary="Your controls" open>
              <p>Exactly 0.05 U, into BNB Chain&apos;s escrow <AddressChip value={ESCROW} chainId={56} />. You can cancel before paying. If Keel does not deliver, you reclaim it after the date shown.</p>
            </Disclosure>
            <Disclosure summary="Details">
              <p>createJob, registerJob, setBudget, approve, fund. The technical names live here, never on the button.</p>
            </Disclosure>
          </div>
          <div>
            <Tabs label="Marketplace view" tabs={[
              { id: 'ready', label: 'Ready to hire', count: 14, content: <p className={styles.note}>Hireable agents, sorted by quality then rating then price.</p> },
              { id: 'free', label: 'Try free', count: 31, content: <p className={styles.note}>Agents that answer a free preview.</p> },
              { id: 'tested', label: 'All tested', count: 508, content: <p className={styles.note}>Everything Marque has tested, with results.</p> },
              { id: 'registry', label: 'Registry', content: <p className={styles.note}>Every registered agent, with its honest reason when it cannot be hired.</p> },
            ]} />
            <p className={styles.note} style={{ marginTop: 16 }}>
              Hover or focus: <Tooltip content="A signed quote from the agent, valid until the time shown."><button type="button" className="icon-btn icon-btn--bare" aria-label="What is a live quote?"><Info /></button></Tooltip>
            </p>
          </div>
        </div>
      </Story>

      <Story id="overlays" title="Sheet, Drawer, Modal, Toast" note="Focus trapped, Escape closes, focus returns">
        <div className={styles.inline}>
          <Button variant="primary" onClick={() => setSheet(true)}>Open the hire sheet</Button>
          <Button onClick={() => setDrawer(true)}>Open a drawer</Button>
          <Button onClick={() => setModal(true)}>Open a modal</Button>
          <Button onClick={() => toast({ tone: 'success', title: 'Paid into escrow', body: '0.05 U is held until Keel delivers.', href: `https://bscscan.com/tx/${FUND_TX}` })}>Success toast</Button>
          <Button onClick={() => toast({ tone: 'info', title: 'Keel is working', body: 'Delivery usually takes about 20 seconds.' })}>Info toast</Button>
          <Button onClick={() => toast({ tone: 'error', title: 'You declined the request in your wallet.', body: 'Nothing was sent. Continue when you are ready.' })}>Error toast</Button>
        </div>
        <Sheet open={sheet} onClose={() => setSheet(false)} label="Hire Keel" surface="chamber"
          title={<><span className="t-label">Hire · BSC mainnet</span></>}
          footer={<Button variant="primary" block onClick={() => setStep((s) => Math.min(6, s + 1))}>Continue in wallet</Button>}>
          <div className={styles.stack}>
            <h2 className="t-h3">Keel · Health factor</h2>
            <PriceTag amount="0.05" token="U" source={{ kind: 'quote', expiresAt: Date.now() + 13 * 60_000 }} />
            <TxStepper steps={stepsAt(step, false)} />
          </div>
        </Sheet>
        <Drawer open={drawer} onClose={() => setDrawer(false)} label="Filters">
          <p className={styles.note}>A side drawer for filters and the mobile menu.</p>
        </Drawer>
        <Modal open={modal} onClose={() => setModal(false)} title="Cancel this job?" footer={<><Button onClick={() => setModal(false)}>Keep it</Button><Button variant="danger" onClick={() => setModal(false)}>Cancel job</Button></>}>
          <p className={styles.note}>The job is open and unpaid. Cancelling costs a little gas and nothing else.</p>
        </Modal>
      </Story>

      <Story id="measure" title="MeasureRule" note="One device, four categories">
        <div className={styles.grid2}>
          <div className={styles.stack}>
            <div className={styles.measureHead}><span>LP price range</span><Chip tone="watch">0.53% from the upper bound</Chip></div>
            <MeasureRule label="BTCB/USDC position, price 81157 inside a range of 72001 to 81588" value={81157} lower={72001} upper={81588} lowerLabel="72,001" upperLabel="81,588" valueLabel="81,157 USDC/BTCB" state="watch" />
          </div>
          <div className={styles.stack}>
            <div className={styles.measureHead}><span>Health factor</span><Chip tone="breach">Liquidation at 1.00</Chip></div>
            <MeasureRule label="Venus health factor 1.063, liquidation at 1.0" value={1.063} lower={1} upper={3} threshold={1} thresholdLabel="liq 1.00" lowerLabel="1.00" upperLabel="3.00" valueLabel="HF 1.063" state="breach" />
          </div>
          <div className={styles.stack}>
            <div className={styles.measureHead}><span>Net APR at your size</span><Chip tone="holds">Best available 3.05%</Chip></div>
            <MeasureRule label="Earning 0 percent against a best net APR of 3.05 percent" value={0} lower={0} upper={3.05} threshold={0.9} thresholdLabel="break-even" lowerLabel="0%" upperLabel="3.05%" valueLabel="you 0.00%" state="watch" />
          </div>
          <div className={styles.stack}>
            <div className={styles.measureHead}><span>Grid band</span><Chip>12 levels, stop 580</Chip></div>
            <MeasureRule label="BNB price 724 within a grid band of 600 to 850, stop at 580" value={724} lower={600} upper={850} threshold={580} thresholdLabel="stop 580" lowerLabel="600" upperLabel="850" valueLabel="724 USDT" state="holds" />
          </div>
        </div>
        <EvidenceDrawer evidence={{ method: 'Venus Comptroller getAccountSnapshot + markets, weighted by collateral factor', source: '0xfD36E2c2a6789Db23113685031d7F16329158384', at: '2026-09-04T00:34:30.771Z', blockNumber: '119862133', extra: { 'Health factor': '1.181' } }} />
      </Story>

      <Story id="chamber" title="The Chamber" note="Dark in both themes: money is moving">
        <div className={styles.chamberBand} data-surface="chamber">
          <Statement as="p">Keel is working. Your 0.05 U is held in escrow until it delivers.</Statement>
          <div className={styles.inline}>
            <ProvenanceChip provenance="ONCHAIN" /><Chip tone="holds">Delivered in 21 s</Chip><HashChip value={FUND_TX} chainId={56} />
          </div>
          <div className={styles.inline}><Button variant="primary">Rate Keel</Button><Button>Open the job room</Button></div>
        </div>
      </Story>
    </div>
  )
}
