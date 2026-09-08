/**
 * The route-transition loading state.
 *
 * Two things it must not do: flash on a fast navigation, and fidget. It stays
 * fully invisible for the first 380ms (most in-app navigations finish inside
 * that), then the mark draws itself once — the two wing strokes laid down like
 * ink, the fill rising behind them — and holds. No spinner, no bounce, no loop
 * beyond one slow breath. Calm, deliberate, done.
 */
export default function Loading() {
  return (
    <div className="marque-loading-screen" aria-busy="true" aria-label="Loading">
      <svg className="marque-loading-mark" width="84" height="58" viewBox="0 0 100 69" aria-hidden="true">
        <path
          className="mlm-wing"
          d="M50 21C43 13 27 5 17 2.5C9 1 0 3 0 8.5L0 63L1 67.5C15 54 33 32 50 21Z"
        />
        <path
          className="mlm-wing mlm-wing--r"
          d="M50 21C57 13 73 5 83 2.5C91 1 100 3 100 8.5L100 63L99 67.5C85 54 67 32 50 21Z"
        />
      </svg>
    </div>
  )
}
