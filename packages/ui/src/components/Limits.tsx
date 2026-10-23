import type { ReactNode } from 'react'

/**
 * The Limits disclosure (DESIGN-V4 section 8, invariant 37). One quiet line, "What this
 * shows and does not show", that opens into the caveats behind the claim it sits next to.
 * Honesty stays complete; it stops shouting.
 *
 * Native details/summary: it works in server components with no script, the expanded
 * state reaches assistive tech, and every sentence stays in the document (searchable,
 * printable, testable) while closed.
 */
export function Limits({ children, label = 'What this shows and does not show', className }: {
  children: ReactNode
  label?: string
  className?: string
}) {
  return (
    <details className={className ? `limits ${className}` : 'limits'} data-limits="">
      <summary>
        <svg className="limits-glyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 7.2v4.1M8 4.9v.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {label}
      </summary>
      <div className="limits-body">{children}</div>
    </details>
  )
}
