import { MarqueMark } from './_components/MarqueMark'

/**
 * The route-transition loading state. One mark — `currentColor`, so it is right
 * in daylight and at night with no second image — centred in the viewport, a
 * slow breath. No spinner, no bar.
 */
export default function Loading() {
  return (
    <div className="marque-loading-screen" aria-busy="true" aria-label="Loading">
      <MarqueMark size={92} className="marque-loading-mark" />
    </div>
  )
}
