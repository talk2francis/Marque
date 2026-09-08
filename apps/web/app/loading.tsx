/**
 * The route-transition loading state (P10.5H). The real mark, a slow breath —
 * no spinner, no bar. Sized to actually register, not a speck.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      style={{
        minHeight: '62vh',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <span className="marque-loading">
        <img className="marque-loading-ink" src="/brand/mark-ink.png" alt="" width="72" height="53" />
        <img className="marque-loading-cream" src="/brand/mark-cream.png" alt="" width="72" height="53" />
      </span>
    </div>
  )
}
