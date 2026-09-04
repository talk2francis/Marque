import {
  MeasureRule, Statement, DataCell, ProvenanceChip, Chip, WarrantBadge,
  Button, Row, EmptyState, EvidenceDrawer, Tape, Grain,
} from '@marque/ui'
import styles from './ui.module.css'

export const metadata = { title: 'Design system — Marque', robots: { index: false } }

/**
 * The proving page for the design system.
 *
 * Its real job is the MeasureRule section: one component has to carry an LP
 * price range, a health factor, a net-APR comparison and a grid band, and if it
 * cannot do all four legibly then "equal depth across four categories" is a
 * claim rather than something you can see. Every number here is a real value
 * lifted from a live read, labelled as a fixture so it can never be mistaken
 * for live product data.
 */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.body}>{children}</div>
    </section>
  )
}

export default function UiPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Statement as="h1" size="hero">The design system, proved.</Statement>
        <p className={styles.lede}>
          Fixtures, not live data. Values are copied from real mainnet reads so the
          components are exercised at realistic magnitudes, but nothing on this page
          is fetched and nothing here is a product surface.
        </p>
      </header>

      <Section
        title="MeasureRule — one component, four categories"
        note="A 3px rule showing where a value sits inside its safe band, with the threshold marked. This is the signature device; there is deliberately no second one."
      >
        <div className={styles.measures}>
          <div className={styles.measureBlock}>
            <div className={styles.measureHead}>
              <span>LP price range</span>
              <Chip tone="watch">0.53% from the upper bound</Chip>
            </div>
            <MeasureRule
              label="BTCB/USDC position, price 81157 inside a range of 72001 to 81588"
              value={81157} lower={72001} upper={81588}
              lowerLabel="72,001" upperLabel="81,588" valueLabel="81,157 USDC/BTCB"
              state="watch"
            />
          </div>

          <div className={styles.measureBlock}>
            <div className={styles.measureHead}>
              <span>Health factor</span>
              <Chip tone="breach">Liquidation at 1.00</Chip>
            </div>
            <MeasureRule
              label="Venus health factor 1.063, liquidation at 1.0, comfortable above 2.5"
              value={1.063} lower={1} upper={3}
              threshold={1} thresholdLabel="liq 1.00"
              lowerLabel="1.00" upperLabel="3.00" valueLabel="HF 1.063"
              state="breach"
            />
          </div>

          <div className={styles.measureBlock}>
            <div className={styles.measureHead}>
              <span>Net APR at your size</span>
              <Chip tone="holds">Best available 3.05%</Chip>
            </div>
            <MeasureRule
              label="Currently earning 0 percent against a best available net APR of 3.05 percent"
              value={0} lower={0} upper={3.05}
              threshold={0.9} thresholdLabel="break-even $0.70"
              lowerLabel="0%" upperLabel="3.05%" valueLabel="you 0.00%"
              state="watch"
            />
          </div>

          <div className={styles.measureBlock}>
            <div className={styles.measureHead}>
              <span>Grid band</span>
              <Chip>12 levels · stop 580</Chip>
            </div>
            <MeasureRule
              label="BNB price 724 within a grid band of 600 to 850, stop at 580"
              value={724} lower={600} upper={850}
              threshold={580} thresholdLabel="stop 580"
              lowerLabel="600" upperLabel="850" valueLabel="724 USDT"
              state="holds"
            />
          </div>

          <div className={styles.measureBlock}>
            <div className={styles.measureHead}>
              <span>Out of band</span>
              <Chip tone="breach">Below the range</Chip>
            </div>
            <MeasureRule
              label="Price 560 has fallen below a range of 600 to 850"
              value={560} lower={600} upper={850}
              lowerLabel="600" upperLabel="850" valueLabel="560 — out of range"
              state="breach"
            />
          </div>
        </div>
      </Section>

      <Section
        title="Provenance"
        note="Four fixed tokens, and the one place ALL-CAPS is justified: a controlled vocabulary rather than decoration. CLAIMED is deliberately the weakest thing on the page."
      >
        <div className={styles.inline}>
          <ProvenanceChip provenance="ONCHAIN" />
          <ProvenanceChip provenance="MEASURED" />
          <ProvenanceChip provenance="TESTED" />
          <ProvenanceChip provenance="CLAIMED" />
        </div>
        <div className={styles.spacer} />
        <EvidenceDrawer
          evidence={{
            method: 'Venus Comptroller getAccountSnapshot + markets, weighted by collateral factor',
            source: '0xfD36E2c2a6789Db23113685031d7F16329158384',
            at: '2026-09-04T00:34:30.771Z',
            blockNumber: '119862133',
            extra: { 'Health factor': '1.181', 'Collateral factor': '0.80' },
          }}
        />
      </Section>

      <Section title="Warrants" note="A mark is always dated, because a pass goes stale. A failure names the field.">
        <div className={styles.inline}>
          <WarrantBadge status="warranted" date="4 Sep" />
          <WarrantBadge status="failed" testId="MCS-REB-1" failedField="proposedTickSpacing" />
          <WarrantBadge status="untested" />
        </div>
      </Section>

      <Section title="Rows" note="Not cards. A grid of identical rounded cards is the clearest tell of a generated interface.">
        <div className={styles.rows}>
          <Row href="#">
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>Reference row</span>
              <span className={styles.rowSub}>Dense, about 64px, eight to a screen</span>
            </div>
            <DataCell>6.4s</DataCell>
            <WarrantBadge status="warranted" date="4 Sep" />
          </Row>
          <Row muted>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>Unreachable row</span>
              <span className={styles.rowSub}>Present and legible, visibly not live</span>
            </div>
            <DataCell muted>—</DataCell>
            <Chip tone="breach">unbound</Chip>
          </Row>
        </div>
      </Section>

      <Section title="Buttons" note="Plain verbs, sentence case, no arrow appended to the label.">
        <div className={styles.inline}>
          <Button variant="primary">Grant a charter</Button>
          <Button variant="secondary">Read chain</Button>
          <Button variant="quiet">Show the graveyard</Button>
          <Button variant="secondary" disabled>Unavailable</Button>
        </div>
      </Section>

      <Section title="Empty states" note="An invitation, never a shrug, and never a placeholder number.">
        <EmptyState title="No agent has passed MCS-GRID-1 yet.">
          <p>If you run a grid agent on BNB Smart Chain, test it here. It takes about a minute and costs nothing.</p>
        </EmptyState>
      </Section>

      <Section
        title="The cockpit"
        note="Light for looking, dark for doing. Only ground, ink and rule swap; type scale, spacing, chips and buttons are identical. The transition is a dim, never a navigation."
      >
        <div className={styles.cockpit} data-surface="cockpit">
          <Grain />
          <div className={styles.cockpitInner}>
            <Statement as="p">Bound may spend up to 100.00 USDT, until 5 Sep 14:30 UTC.</Statement>
            <div className={styles.inline}>
              <ProvenanceChip provenance="ONCHAIN" />
              <Chip tone="holds">2 contracts permitted</Chip>
              <DataCell>73.40 USDT remaining</DataCell>
            </div>
            <MeasureRule
              label="73.40 of 100 USDT remaining on this charter"
              value={73.4} lower={0} upper={100}
              lowerLabel="0" upperLabel="100 USDT" valueLabel="73.40 left"
              state="holds"
            />
            <Button variant="primary">Grant this charter</Button>
          </div>
        </div>
      </Section>

      <Section title="Tape" note="Real events only. With none to show it does not render — which is what you are looking at.">
        <Tape events={[]} />
        <EmptyState title="No settled runs yet.">
          <p>The Tape appears here once real runs settle. It will never show invented activity.</p>
        </EmptyState>
      </Section>
    </main>
  )
}
