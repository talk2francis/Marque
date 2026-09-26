import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

/** Native details/summary: keyboard and screen-reader support for free. */
export function Disclosure({ summary, children, open, boxed, className }: { summary: ReactNode; children: ReactNode; open?: boolean; boxed?: boolean; className?: string }) {
  return (
    <details className={cx('disclosure', boxed && 'disclosure--boxed', className)} open={open}>
      <summary>{summary}<span className="disclosure-chev" aria-hidden="true"><ChevronDown /></span></summary>
      <div className="disclosure-body">{children}</div>
    </details>
  )
}
