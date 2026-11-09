import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { chartersVisible, PREVIEW_COOKIE } from '../../../lib/charters-access'
import styles from '../docs.module.css'
import { DocSection, DocShell } from '../_ui/DocShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Charters', description: 'An onchain limit on what an agent may do for you. Four kinds: Loan Guard, Yield Sweep, Grid Band and Range Keeper. Each does one job, only when the chain shows the condition, inside limits you sign.' }

const sections = [
  { id: 'what', label: 'What a charter is' }, { id: 'kinds', label: 'The four kinds' }, { id: 'assets', label: 'Where your assets are' },
  { id: 'ceiling', label: 'An allowance is a ceiling' }, { id: 'who', label: 'Who presses the button' }, { id: 'end', label: 'Ending, and recovery' },
  { id: 'limits', label: 'Limits we state plainly' }, { id: 'check', label: 'Check it yourself' },
]

/** /docs/charters (16_PUBLIC_COPY, user guide, four kinds). Behind CHARTERS_PUBLIC until launch. */
export default async function ChartersDocs() {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  return <DocShell current="charters" label="Docs · Charters" title="Charters: agents that act for you, inside lines you draw." lede="A charter is an onchain limit on what an agent may do for you. Four kinds today: Loan Guard, Yield Sweep, Grid Band and Range Keeper." sections={sections}
    actions={<><a className="btn btn--primary" href="/charters/new">Grant a charter</a><a className="btn" href="/docs/developers/charters">For builders</a></>}>
    <DocSection id="what" title="What a charter is">
      <p>An onchain limit on what an agent may do for you. You sign it once. It ends on the date you choose, or sooner if you end it. Everything it may do is fixed in its own small contract when you create it: nobody, including Marque, can widen it afterwards. It does one job, and only when the chain shows the condition, read in the same transaction.</p>
    </DocSection>
    <DocSection id="kinds" title="The four kinds, one minute each">
      <h3>Loan Guard</h3>
      <blockquote><p>If my loan health falls below 1.30, repay my USDT loan back to 1.80, using up to 500 USDT from my wallet, until 8 Dec.</p></blockquote>
      <p>Venus compares what your collateral is worth, weighted the way Venus weights it for liquidation, to what you owe: that is your health, and at 1.00 Venus can liquidate. The guard reads Venus&apos;s own number when it acts and repays exactly enough to reach your target, never past your budget. It does not spend on a loan it cannot lift back to 1.00, and it never makes a repayment smaller than its minimum unless that restores your target. Anyone may press its button. <b>It can never</b> borrow or touch your collateral, send money anywhere except your own loan, use more than its budget, or act above the trigger or after the end date.</p>
      <h3>Yield Sweep</h3>
      <blockquote><p>Keep between 200 and 300 USDC in my wallet. Put the rest in Venus in my name, bring it back when I run low, supplying at most 5,000 USDC over the charter&apos;s life, until 8 Jan.</p></blockquote>
      <p>Above your ceiling it supplies down to the middle of your band with Venus&apos;s <code>mintBehalf</code>, so the vTokens land in your wallet. Below your floor it brings back, from what it supplied, up to the middle. If you borrow that stablecoin on Venus, supplying it would become collateral, so the sweep holds unless you turn on collateral mode with a health limit. Anyone may press its button. <b>It can never</b> move money anywhere but between your wallet and your own Venus balance, touch Venus supply you made yourself, supply more than its lifetime limit, or act after the end date.</p>
      <h3>Grid Band</h3>
      <blockquote><p>Between $560 and $720 on BNB/USDT, buy 50 USDT of BNB at each of 8 levels as the price falls and sell each one a level higher, using at most 1,200 USDT and 2.1 BNB in total, until 8 Dec.</p></blockquote>
      <p>It trades one reviewed PancakeSwap v3 pool, paying the pool straight from your wallet and sending what it buys straight to your wallet. Decisions use the pool&apos;s 5-minute average price, never a single trade; every trade has a hard price limit close to that average, and the levels are spaced so that a completed round trip at the worst allowed prices, fees included, still returns at least what it spent. Only agents you name may trade. <b>It can never</b> trade another pair or pool, hold your funds, buy or sell more than its totals, or trade between levels.</p>
      <h3>Range Keeper</h3>
      <blockquote><p>When BNB has been outside my 560 to 640 range for 10 minutes, move the range back around the price, same width. At most 12 moves, at most one an hour, each losing at most 1% at the average price, until 8 Feb.</p></blockquote>
      <p>When the average price has been outside your range, it removes the position, makes one bounded swap in the same pool, and mints the same width around the price. Fees go to your wallet, or into the position if you choose. Each move must keep at least your limit of the value at the average price, or the whole move is cancelled. Only agents you name may move it. <b>It can never</b> send your position or tokens anywhere but back to you, use another pool, move more often or more times than you set, or lose more than your limit per move.</p>
    </DocSection>
    <DocSection id="assets" title="Where your assets are">
      <ul>
        <li><b>Loan Guard, Yield Sweep, Grid Band:</b> in your wallet, under exact allowances to that charter&apos;s own contract. Tokens move only at the moment it acts. Yield Sweep&apos;s Venus balance is your own vTokens, also in your wallet: you can redeem them in the Venus app at any time.</li>
        <li><b>Range Keeper:</b> your position NFT moves into your own Range Keeper contract while the charter runs. Take it back any time with End. It mints each new position there and sends everything else to your wallet.</li>
      </ul>
    </DocSection>
    <DocSection id="ceiling" title="An allowance is a ceiling, not a reservation">
      <p>If you approve 500 USDT for a charter, nothing is set aside. The money stays in your wallet, and you, other apps and other charters can spend it first. A charter uses what is there when it acts. When two charters draw the same token, My Marque shows them together beside your balance, and says Needs you when their next needs exceed it.</p>
    </DocSection>
    <DocSection id="who" title="Who presses the button">
      <ul>
        <li><b>Open kinds (Loan Guard, Yield Sweep):</b> anyone, because every possible action is safe for you whoever presses it and whenever.</li>
        <li><b>Named kinds (Grid Band, Range Keeper):</b> only you and the agents you name, because the moment of a trade has value to whoever chooses it.</li>
        <li><b>Marque&apos;s agents:</b> Keel (Loan Guard), Sluicegate (Yield Sweep), Lattice (Grid Band) and Bound (Range Keeper). Keel, Lattice and Bound act through an Altana session key that can call only your charter&apos;s act function, until it ends; anyone can see that key on Altana KeyStore. Sluicegate sends from its own account. A Marque backup acts if they are quiet (on Grid Band and Range Keeper only if you named it).</li>
        <li><b>Tips:</b> optional, from a separate tip budget, paid after the action and only to a caller who is not you. A tip that cannot be paid is skipped, never blocking the action.</li>
      </ul>
    </DocSection>
    <DocSection id="end" title="Ending, and recovery without Marque">
      <p>End charter is one transaction from your wallet, and it works at any time, without Marque. You can clear the allowances in the same step. From the next block, nothing can act.</p>
      <ul>
        <li><b>Loan Guard, Grid Band:</b> <code>end()</code> on the charter, then set its allowances to zero, from BscScan&apos;s write tab if Marque is down.</li>
        <li><b>Yield Sweep:</b> the same; your vTokens are already in your wallet, so redeem them in the Venus app.</li>
        <li><b>Range Keeper:</b> <code>end()</code> sends your position back in the same transaction. After the end date anyone can call <code>release()</code> to send it to you.</li>
      </ul>
    </DocSection>
    <DocSection id="limits" title="Limits we state plainly">
      <ul>
        <li>The contracts are new and unaudited. Read them and their tests before you rely on one.</li>
        <li>No charter can act while Venus or the pool refuses: a paused market, an unavailable price, or a pool without enough history.</li>
        <li>Loan Guard: a crash faster than a check can still reach liquidation, and a dip that recovers minutes later still triggers a real repayment.</li>
        <li>Yield Sweep: it holds on a market you borrow, unless you choose collateral mode. Venus may not have free cash to pay out at a given moment.</li>
        <li>Grid Band: in a long fall it holds what it bought above the price until the price recovers.</li>
        <li>Range Keeper: a kept range can be worth less than holding the two tokens if the price trends. A kept position does not earn CAKE farm rewards.</li>
      </ul>
    </DocSection>
    <DocSection id="check" title="Check it yourself">
      <p>Every charter page has a Check it yourself panel. On BscScan you can read, without trusting Marque:</p>
      <ul>
        <li><code>isCharter(charter)</code> on the kind&apos;s factory: true only for charters it made.</li>
        <li><code>preview()</code> on the charter: what it would do right now, in the same numbers it acts on.</li>
        <li>The agent&apos;s key on Altana KeyStore: one contract, one function, until a date.</li>
      </ul>
      <p className={styles.note}>The source of every contract is in the public repository under <code>contracts/src/charters</code>, with its unit, fuzz, invariant, cross-category, differential and fork tests.</p>
    </DocSection>
  </DocShell>
}
