import { MarqueMark } from './_components/MarqueMark'

/**
 * The route-transition loading state (P10.5H). The mark, a slow breath — no
 * spinner, no bar. Kept deliberately quiet so a fast navigation barely shows it.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <MarqueMark size={40} className="marque-loading-mark" />
    </div>
  )
}
