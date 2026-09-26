'use client'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'

/**
 * A form field. Numbers are right-aligned and tabular with the token as a
 * suffix; text and addresses are left-aligned. Helper below, or the error in
 * its place (announced).
 */
export function Field({ label, note, value, onChange, unit, action, help, error, placeholder, kind = 'number', name, autoFocus, disabled }: {
  label: string; note?: ReactNode; value: string; onChange: (v: string) => void; unit?: string
  action?: { label: string; onClick: () => void }; help?: ReactNode; error?: string | null
  placeholder?: string; kind?: 'number' | 'text' | 'mono'; name?: string; autoFocus?: boolean; disabled?: boolean
}) {
  const id = useId()
  const described = error || help ? `${id}-d` : undefined
  return (
    <div className="fld" data-invalid={error ? 'true' : undefined}>
      <label className="fld-label" htmlFor={id}>
        <span>{label}</span>
        {note ? <span className="fld-label-note">{note}</span> : null}
      </label>
      <div className="fld-box">
        <input
          id={id}
          name={name}
          value={value}
          placeholder={placeholder ?? (kind === 'number' ? '0.00' : '')}
          inputMode={kind === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          data-align={kind === 'number' ? 'right' : undefined}
          data-kind={kind === 'number' ? undefined : kind}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          onChange={(e) => onChange(kind === 'number' ? e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') : e.target.value)}
        />
        {unit ? <span className="fld-unit">{unit}</span> : null}
        {action ? <button type="button" className="fld-action" onClick={action.onClick}>{action.label}</button> : null}
      </div>
      {error
        ? <div id={described} className="fld-error" role="alert"><AlertCircle aria-hidden="true" />{error}</div>
        : help ? <div id={described} className="fld-help">{help}</div> : null}
    </div>
  )
}

export function SelectField({ label, value, onChange, options, help, name }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; help?: ReactNode; name?: string
}) {
  const id = useId()
  return (
    <div className="fld">
      <label className="fld-label" htmlFor={id}><span>{label}</span></label>
      <div className="fld-box">
        <select id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={help ? `${id}-d` : undefined}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="fld-chevron" aria-hidden="true"><ChevronDown /></span>
      </div>
      {help ? <div id={`${id}-d`} className="fld-help">{help}</div> : null}
    </div>
  )
}
