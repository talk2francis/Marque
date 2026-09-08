import { MarqueMark } from './_components/MarqueMark'

/**
 * The route-transition loading state. One mark — the real symbol, `currentColor`
 * so it is right in daylight and at night with no second image — centred in the
 * viewport. The two wings unfold from the centre pinch, then the mark holds a
 * slow, even breath. No spinner, no bar, no blink.
 */
export default function Loading() {
  return (
    <div className="marque-loading-screen" aria-busy="true" aria-label="Loading">
      <div className="marque-loading-mark">
        <MarqueMark size={128} winged title="Marque" />
      </div>
    </div>
  )
}
