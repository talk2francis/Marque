import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ink' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const cls = (v: ButtonVariant, s: ButtonSize, block?: boolean, extra?: string) =>
  cx('btn', `btn--${v}`, s !== 'md' && `btn--${s}`, block && 'btn--block', extra)

/** Plain verbs, sentence case. `loading` keeps the width and shows a spinner. */
export function Button({ variant = 'secondary', size = 'md', loading = false, block, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; block?: boolean
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cls(variant, size, block, className)}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
    >
      {children}
    </button>
  )
}

/** A link that looks like a button. External links open in a new tab. */
export function ButtonLink({ href, variant = 'secondary', size = 'md', block, external, className, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string; variant?: ButtonVariant; size?: ButtonSize; block?: boolean; external?: boolean; children: ReactNode
}) {
  return (
    <a href={href} className={cls(variant, size, block, className)} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...rest}>
      {children}
    </a>
  )
}

/** A square icon button. The label is required: an icon alone has no accessible name. */
export function IconButton({ label, bare, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; bare?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={cx('icon-btn', bare && 'icon-btn--bare', className)}>
      {children}
    </button>
  )
}
