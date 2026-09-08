/**
 * The route-transition loading state.
 *
 * Requirements it has to satisfy: never flash on a fast navigation, never
 * fidget, never look like a spinner. So the whole screen stays invisible for
 * 400ms — most in-app navigations finish inside that — then the mark fades up
 * and simply *is* there, holding a slow, barely-there breath while a single
 * brass sheen passes across it, the way light moves on a struck seal. One
 * gesture, no loop that draws attention to itself.
 */
export function LoadingMark() {
  return (
    <svg
      className="marque-loading-mark"
      width="72"
      height="50"
      viewBox="0 0 100 69"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mlm-sheen" x1="-40%" y1="0%" x2="0%" y2="80%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#e8c877" stopOpacity="1" />
          <stop offset="55%" stopColor="#e8c877" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
          <animate
            attributeName="x1"
            values="-60%;100%;100%"
            keyTimes="0;0.55;1"
            dur="3200ms"
            repeatCount="indefinite"
          />
          <animate
            attributeName="x2"
            values="-20%;140%;140%"
            keyTimes="0;0.55;1"
            dur="3200ms"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>
      <g fill="url(#mlm-sheen)">
        <path d="M50 21C43 13 27 5 17 2.5C9 1 0 3 0 8.5L0 63L1 67.5C15 54 33 32 50 21Z" />
        <path d="M50 21C57 13 73 5 83 2.5C91 1 100 3 100 8.5L100 63L99 67.5C85 54 67 32 50 21Z" />
      </g>
    </svg>
  )
}

export default function Loading() {
  return (
    <div className="marque-loading-screen" aria-busy="true" aria-label="Loading">
      <LoadingMark />
    </div>
  )
}
