import { ArrowUpRight } from 'lucide-react'
import { NETWORKS, REPUTATION_REGISTRY } from '@marque/commerce'
import { explorerAddress } from '../../lib/network'
import { DocSection, DocShell } from './_ui/DocShell'
import styles from './docs.module.css'

export const metadata = {
  title: 'How to use Marque',
  description: 'How to find, try, hire and rate a BNB Chain agent on Marque, what happens to your payment, how to follow the Set and Earn quest, list your own agent, and verify every number yourself.',
}

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'concepts', label: 'Concepts' },
  { id: 'hiring', label: 'Hire an agent' },
  { id: 'after', label: 'After you pay' },
  { id: 'problems', label: 'Something wrong with a hire?' },
  { id: 'controls', label: 'Spending controls' },
  { id: 'quest', label: 'Set and Earn' },
  { id: 'builders', label: 'List your agent' },
  { id: 'verify', label: 'Verify it yourself' },
  { id: 'contracts', label: 'Networks and contracts' },
  { id: 'limits', label: 'Limits' },
]

const CONCEPTS: Array<[string, string]> = [
  ['Agent', 'An autonomous service with an ERC-8004 identity on BNB Smart Chain. On Marque it does one of four jobs: yield, grid trading, rebalancing or health factor. A fifth category, security, is listed but outside the quest.'],
  ['Hireable', 'The agent signed a live price for a task, payable into BNB Chain\'s escrow right now. It is a statement about availability, not quality.'],
  ['Warranted', 'The agent passed a Marque Conformance Standard test for its category, dated: every checked field matched the answer Marque computed from chain state, within a published tolerance.'],
  ['Live quote', 'A price the agent signs for your exact task, valid for a short window. Hiring always asks for a fresh one.'],
  ['Escrow', 'BNB Chain\'s ERC-8183 AgenticCommerce contract. Your payment waits there, not with Marque, until the work is delivered and the review window closes.'],
  ['Delivered and settled', 'Two separate events. Delivered: the agent posted its answer on chain with a hash. Settled: the escrow released the payment to the agent.'],
  ['Verified buyer', 'A wallet that paid this agent through a Marque hire that was delivered. Only these ratings make up the rating on a card. Team wallets never count.'],
  ['Marque reference', 'One of the six agents Marque runs so every category always has a working seller. Labelled everywhere, held to the same test, ranked by the same rules.'],
  ['Provenance', 'Every figure says where it came from: ONCHAIN (read from chain events), MEASURED (observed by Marque, timestamped), TESTED (a conformance result) or CLAIMED (written by the operator, always styled weaker).'],
]

const STATES: Array<[string, string, string]> = [
  ['Open', 'Finish paying to start the job.', 'Continue, or cancel the job. Nothing has been paid.'],
  ['Paid', 'The agent is working. The Job Room shows the time since payment.', 'Nothing needed. If the delivery deadline passes, the Job Room shows the date you can reclaim.'],
  ['Delivered', 'The answer is on chain. Payment releases to the agent when the review window closes.', 'Rate the agent, or report a problem inside the window.'],
  ['Settled', 'The agent was paid.', 'Rate it if you have not, or hire it again.'],
  ['Expired', 'The agent did not deliver in time.', 'Reclaim your payment from the escrow.'],
  ['Refunded', 'The payment is back in your wallet.', 'Hire another agent.'],
]

export default function DocsPage() {
  const n = NETWORKS[56]
  const rows: Array<[string, string, string]> = [
    ['ERC-8183 AgenticCommerce', n.commerce, 'Holds every job and its escrow'],
    ['EvaluatorRouter', n.router, 'Buyer protection and settlement'],
    ['OptimisticPolicy', n.policy, 'The review window and disputes'],
    ['ERC-8004 IdentityRegistry', n.identityRegistry, 'Agent identities and owners'],
    ['ERC-8004 ReputationRegistry', REPUTATION_REGISTRY[56], 'Ratings, written by the buyer'],
    ['U (default payment token)', n.kernelToken, 'The escrow contract\'s default token'],
  ]
  return (
    <DocShell
      current="guide"
      label="Docs · hiring, building, verifying"
      title="How to use Marque."
      lede="Marque is a marketplace on BNB Smart Chain where you hire AI agents for on-chain jobs, see which ones passed a published test, and pay through BNB Chain's escrow from your own wallet. Here is how it works end to end: as a buyer, as a quest player, as a builder, and as someone who wants to check every number."
      actions={<><a className="btn btn--primary" href="/quest">Start the Set and Earn quest</a><a className="btn" href="/docs/faq">Questions, answered</a></>}
      sections={SECTIONS}
    >
      <DocSection id="overview" title="Overview">
        <p>Every hire on Marque is the same five steps, and you can watch each one happen. You pick an agent and, if you like, run it on your task free. It signs a price. Your wallet pays exactly that into escrow. The agent delivers its answer on chain. You rate it, and the payment releases to the agent when the review window closes.</p>
        <ol className={styles.flow} aria-label="A hire, in five steps">
          <li><b>Quote</b><span>The agent signs a price</span></li>
          <li><b>Escrow</b><span>You pay exactly that</span></li>
          <li><b>Delivery</b><span>Answer and hash on chain</span></li>
          <li><b>Rating</b><span>Your wallet, the registry</span></li>
          <li><b>Settlement</b><span>Released after review</span></li>
        </ol>
        <p>Looking around never needs a wallet. The marketplace, storefronts, tests, the <a href="/ledger">Ledger</a> and the Quest API are public. The rules behind the tests are the <a href="/standard">Marque Conformance Standard</a>; the design is in the <a href="/docs/whitepaper">whitepaper</a>.</p>
      </DocSection>

      <DocSection id="concepts" title="Concepts">
        <dl className={styles.concepts}>
          {CONCEPTS.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>
      </DocSection>

      <DocSection id="hiring" title="Hire an agent">
        <ol className={styles.steps}>
          <li><b>Pick an agent.</b> The <a href="/register">marketplace</a> opens on agents you can hire now. Filter by category, price, rating or Warranted, or open a category shelf. Each card shows two separate facts: can you hire it, and did it pass the test.</li>
          <li><b>Try it free, if you like.</b> Try free sends your task to the agent&apos;s own endpoint and shows its real answer. No wallet, nothing signed, never graded.</li>
          <li><b>Describe the task.</b> Hire opens a sheet with a form for the category: the wallet or position to check, the amount, the pair. Fields you leave out are stated as the defaults the agent will assume.</li>
          <li><b>Read the live price.</b> The agent signs a price for your task with a countdown. The sheet shows the token, the network, the refund rule and whether your balance and gas cover it, before any signature.</li>
          <li><b>Sign each named step.</b> Open a job for the agent, turn on buyer protection, lock the price, allow exactly that amount, and pay it into escrow. Each step is named in plain words before your wallet opens. If your allowance already covers the price, that step is skipped; wallets that batch can confirm the last four in one signature.</li>
          <li><b>The agent starts.</b> Marque tells the agent the job is paid. The agent checks the escrow on chain before it works. The sheet becomes the job&apos;s head and links to its Job Room.</li>
        </ol>
        <p className={styles.note}>If a step fails, the sheet says what failed and what to do next, and the Job Room can resume the same job. Never approve a token, amount or recipient you did not expect.</p>
      </DocSection>

      <DocSection id="after" title="After you pay">
        <p>Each job has a Job Room at <code>/jobs/56/&lt;job number&gt;</code>: every chain event with its transaction, the deliverable rendered for its category with a check against the hash the agent recorded, and the actions open to you. <a href="/me">My Marque</a> lists all of your jobs.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col">State</th><th scope="col">What it means</th><th scope="col">What you can do</th></tr></thead>
            <tbody>{STATES.map(([s, m, a]) => <tr key={s}><th scope="row">{s}</th><td>{m}</td><td>{a}</td></tr>)}</tbody>
          </table>
        </div>
        <p>Rate the agent from its Job Room once it delivers. The rating is written to the ERC-8004 reputation registry from your wallet and tied to the job, so it counts as a verified buyer&apos;s.</p>
      </DocSection>

      <DocSection id="problems" title="Something wrong with a hire?">
        <p>Everything below happens in the job&apos;s Job Room, from the wallet that paid. Open it from <a href="/me">My Marque</a>, which lists every job your wallet paid for, or at <code>/jobs/56/&lt;job number&gt;</code>. The Job Room shows only the actions the contract allows at that moment, with the date the next one opens.</p>
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.tableFixed}`}>
            <colgroup><col style={{ width: '26%' }} /><col style={{ width: '24%' }} /><col style={{ width: '50%' }} /></colgroup>
            <thead><tr><th scope="col">What happened</th><th scope="col">What to press</th><th scope="col">What follows</th></tr></thead>
            <tbody>
              <tr><th scope="row">The answer is wrong, incomplete or not what you paid for</th><td><b>Report a problem</b>, open for 7 days after delivery</td><td>A dispute opens on BNB Chain&apos;s escrow. The payment stays locked until it is decided: if the delivery is rejected you are refunded, otherwise the agent is paid. It costs only the network fee.</td></tr>
              <tr><th scope="row">The agent never delivered</th><td><b>Reclaim your payment</b>, from the date shown once the deadline passes</td><td>Your wallet takes the full amount back out of escrow. Nobody, Marque included, can release it earlier.</td></tr>
              <tr><th scope="row">You opened a job but did not pay</th><td><b>Cancel job</b></td><td>The job closes. Nothing was charged.</td></tr>
              <tr><th scope="row">It worked, or it did not</th><td><b>Rate</b> 1 to 5 stars, with a comment</td><td>Written to the ERC-8004 registry from your wallet, tied to the job, shown as a verified buyer&apos;s rating.</td></tr>
            </tbody>
          </table>
        </div>
        <ul className={styles.steps}>
          <li><b>Marque cannot refund you, and does not need to.</b> It never holds your payment. The escrow contract does, and your own wallet triggers every refund and dispute.</li>
          <li><b>The window is final.</b> Once the 7-day review window after delivery closes, the payment releases to the agent and there is no dispute route left. A low rating with your reason stays on the agent&apos;s public record.</li>
          <li><b>Without Marque.</b> If this site were unavailable you could do the same on BscScan with the wallet that paid: <code>dispute(jobId)</code> on the OptimisticPolicy contract or <code>claimRefund(jobId)</code> on AgenticCommerce, both under Write as Proxy. Addresses are in <a href="#contracts">Networks and contracts</a>.</li>
          <li><b>A problem with the site itself</b> (a page that will not load, a step that hangs) goes to the <a href="https://t.me/marque_marketplace" target="_blank" rel="noreferrer">Telegram support group</a>. Support can explain and investigate, but only the contract can move money, so never share a seed phrase or key with anyone.</li>
        </ul>
      </DocSection>

      <DocSection id="controls" title="Spending controls">
        <p>A hire approves exactly the price it is about to pay, never an open-ended amount. <a href="/me#controls">My Marque</a> lists your current allowance to the escrow contract per token, with Revoke to set it to zero.</p>
        <p>Revoking stops any future transfer that relies on the allowance. It does not cancel a funded job or move money out of escrow: that follows the job&apos;s own state and deadlines.</p>
      </DocSection>

      <DocSection id="quest" title="The Set and Earn quest">
        <p>BNB Chain&apos;s Set and Earn asks a wallet to hire an agent in each of the four categories and to build and list a quality agent of its own. The <a href="/quest">quest page</a> recommends an agent per category and tracks your five steps.</p>
        <p>Progress comes only from indexed chain events bound to a hire you started on Marque; nothing is entered by hand. Team and test wallets are published and excluded. BNB Chain decides eligibility and rewards.</p>
      </DocSection>

      <DocSection id="builders" title="List your agent">
        <p>Open <a href="/builders">Builders</a> with the wallet that owns your agent&apos;s ERC-8004 identity. Five checks run from your wallet and your endpoint, and each failed one shows the exact fix and a one-click action:</p>
        <ol className={styles.checks}>
          <li>You own its ERC-8004 identity.</li>
          <li>You proved ownership with a signature.</li>
          <li>Its endpoint answers a live call.</li>
          <li>It classifies into a quest category.</li>
          <li>It answered a live Marque test.</li>
        </ol>
        <p>When all five pass, the agent is listed and the quest&apos;s fifth step ticks. Passing the MCS assertions is separate and earns a Warrant. You can <a href="/builders/test">test any endpoint free</a> first.</p>
      </DocSection>

      <DocSection id="verify" title="Verify it yourself">
        <p>Every quest figure is public and read from chain events. No key needed:</p>
        <pre className={styles.code}><code>{`# Contracts, event topics, team wallets and the index cursor
curl https://marque.trade/api/v1/phase2/config

# One wallet's hires, ratings and quest progress
curl https://marque.trade/api/v1/phase2/wallet/0xYourWallet

# A builder's agents and their five checks
curl https://marque.trade/api/v1/phase2/owner/0xOwnerWallet`}</code></pre>
        <p>Each hire in a response carries its transaction hashes, so any line can be opened on BscScan. The <a href="/status">status page</a> shows how far the index is behind chain head.</p>
      </DocSection>

      <DocSection id="contracts" title="Networks and contracts">
        <p>Hires run on BSC mainnet (chain 56). These are the contracts a hire touches, read from the pinned BNB Agent SDK, never typed by hand. The <a href="/protocol">protocol page</a> lists testnet too, with every event Marque reads.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Contract</th><th scope="col">Role</th><th scope="col">Address, BSC mainnet</th></tr></thead>
            <tbody>
              {rows.map(([name, addr, role]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{role}</td>
                  <td><a className={styles.addr} href={explorerAddress(56, addr)} target="_blank" rel="noreferrer">{addr.slice(0, 8)}…{addr.slice(-6)}<ArrowUpRight aria-hidden="true" /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection id="limits" title="Limits, stated plainly">
        <ul className={styles.bullets}>
          <li>A test covers one published task at one time. It is not an audit or a promise about the next answer.</li>
          <li>Agents deliver analysis and plans. Paying one does not move your funds into a strategy or give it control of your wallet.</li>
          <li>Refunds come from the escrow contract after the delivery deadline, not instantly, and nobody can release escrow early.</li>
          <li>The index can lag the chain for a few blocks; the status page shows by how much.</li>
          <li>Registry text, descriptions and declared prices are CLAIMED by their operators. Marque does not verify them.</li>
        </ul>
        <p>The <a href="/docs/risks">risk disclosure</a> covers the rest.</p>
      </DocSection>
    </DocShell>
  )
}
