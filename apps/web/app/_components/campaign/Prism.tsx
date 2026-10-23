import styles from './campaign.module.css'

/**
 * The Campaign Dock prism (DESIGN-V4 2): a small CSS 3D monolith whose brass fill rises with
 * overall progress. Decorative only (invariant 38): it carries no information the text does
 * not, stops under reduced motion and pauses when the tab is hidden.
 */
export function Prism({ progress, lit = false, warn = false }: { progress: number; lit?: boolean; warn?: boolean }) {
  const p = Math.max(0, Math.min(1, progress))
  return (
    <span className={styles.prism} style={{ ['--p' as string]: p.toFixed(3) }} data-lit={lit || undefined} data-warn={warn || undefined} aria-hidden="true">
      <span className={styles.prismBody}><i /><i /><i /><i /><b /></span>
    </span>
  )
}
