import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { chartersVisible, PREVIEW_COOKIE } from '../../../lib/charters-access'
import styles from '../docs.module.css'
import { DocSection, DocShell } from '../_ui/DocShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Charters: Loan Guard', description: 'A written, onchain limit on what an agent may do for you. Loan Guard repays your own Venus loan when its health falls below the line you draw, never past your budget.' }

const sections = [
  { id: 'what', label: 'What a charter is' }, { id: 'minute', label: 'Loan Guard in one minute' }, { id: 'health', label: 'Health, in plain terms' },
  { id: 'when', label: 'When it acts' }, { id: 'who', label: 'Who presses the button' }, { id: 'never', label: 'What it can never do' },
  { id: 'end', label: 'Ending it' }, { id: 'limits', label: 'Limits we state plainly' }, { id: 'check', label: 'Check it yourself' },
]

/** /docs/charters (11_PUBLIC_COPY, user guide). Behind CHARTERS_PUBLIC until launch. */
export default async function ChartersDocs() {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  return <DocShell current="charters" label="Docs · Charters" title="Charters: agents that act for you, inside a line you draw." lede="A charter is a written, onchain limit on what an agent may do for you. The first kind, Loan Guard, keeps a Venus loan healthy." sections={sections}
    actions={<><a className="btn btn--primary" href="/charters/new">Guard a loan</a><a className="btn" href="/docs/developers/charters">For builders</a></>}>
    <DocSection id="what" title="What a charter is">
      <p>A written, onchain limit on what an agent may do for you. You sign it once. It ends on the date you choose, or sooner if you end it. Everything it may do is fixed in its contract when you create it: nobody, including Marque, can widen it afterwards.</p>
    </DocSection>
    <DocSection id="minute" title="Loan Guard in one minute">
      <p>You write one sentence, and the contract holds you to it:</p>
      <blockquote><p>If my loan health falls below 1.30, repay my USDT loan back to 1.80, using up to 500 USDT from my wallet, until 8 Dec.</p></blockquote>
      <ul>
        <li><b>Your money stays with you.</b> Nothing moves until your loan needs it. Your guard holds only an allowance from your wallet.</li>
        <li><b>One destination.</b> It can only repay your own loan.</li>
        <li><b>The chain decides when.</b> Venus&apos;s own numbers, checked in the same transaction.</li>
        <li><b>One tap to end it.</b> No server, relay or agent can stop you.</li>
      </ul>
    </DocSection>
    <DocSection id="health" title="Health, in plain terms">
      <p>Venus compares what your collateral is worth, weighted the way Venus weights it for liquidation, to what you owe. That ratio is your health. At 1.00, Venus can liquidate: sell your collateral to repay the loan, at a discount. The guard reads the same number Venus uses, from Venus itself, in the transaction that acts.</p>
      <p>The builder translates health into prices: &ldquo;acts if BNB falls to about $478&rdquo;. That is always &ldquo;about&rdquo;: it holds every other price where it is today.</p>
    </DocSection>
    <DocSection id="when" title="When it acts">
      <p>Only when Venus reports your health below your trigger. It then repays exactly enough to bring health back to your target, and never more than your remaining budget, your debt in that market, your allowance or your wallet balance.</p>
      <p>If your health is already below 1.00 and even the most the guard may repay would not lift it back to 1.00, it does not spend at all: it never pours your reserve into a loan it cannot save. Repay directly on Venus or add collateral in that case.</p>
    </DocSection>
    <DocSection id="who" title="Who presses the button">
      <p>The guard&apos;s act button is open to anyone, because the guard checks every rule itself. Pressing it can only ever do the same one thing.</p>
      <ul>
        <li><b>Keel</b>, Marque&apos;s health agent, through an Altana session key that can call only your guard&apos;s act function, until your charter ends. Anyone can see that key on Altana KeyStore.</li>
        <li><b>A backup watcher</b>, Marque&apos;s own, calls directly if the relay is down.</li>
        <li><b>You</b>, with Protect now on the charter page.</li>
        <li><b>Any agent</b>, which may earn the optional thank-you you set.</li>
      </ul>
    </DocSection>
    <DocSection id="never" title="What it can never do">
      <ul>
        <li>Borrow, or touch your collateral.</li>
        <li>Send money anywhere except your own loan.</li>
        <li>Use more than its budget, ever (any thank-you counts inside it).</li>
        <li>Act while your health is above the trigger, or after the end date.</li>
        <li>Spend on a loan it cannot lift back to 1.00.</li>
      </ul>
    </DocSection>
    <DocSection id="end" title="Ending it">
      <p>End charter is one transaction from your wallet, and it works at any time, even after the end date, without Marque. Ending moves no money. You can clear the allowance in the same step. An action already submitted may still land in the same block; from the next block, nothing can act. A charter also stops on its own at its end date.</p>
    </DocSection>
    <DocSection id="limits" title="Limits we state plainly">
      <ul>
        <li>It cannot act if Venus pauses repayments or its price for that market is unavailable.</li>
        <li>A crash faster than a watcher&apos;s check can still reach liquidation.</li>
        <li>A dip that recovers minutes later still triggers a real repayment.</li>
        <li>It repays only stablecoin debt (USDT, USDC, FDUSD) on Venus Core, and only from the wallet that owns the loan.</li>
        <li>The contracts are new and unaudited. Read them and their tests before you rely on one.</li>
      </ul>
    </DocSection>
    <DocSection id="check" title="Check it yourself">
      <p>Every charter page has a Check it yourself panel. On BscScan you can read, without trusting Marque:</p>
      <ul>
        <li><code>isGuard(guard)</code> on the charter factory: true only for guards it made.</li>
        <li><code>preview()</code> on the guard: what it would do right now, in the same numbers it acts on.</li>
        <li>Keel&apos;s key on Altana KeyStore: one contract, one function, until a date.</li>
      </ul>
      <p className={styles.note}>The source of every contract is in the public repository under <code>contracts/src/charters</code>, with its unit, invariant and fork tests.</p>
    </DocSection>
  </DocShell>
}
