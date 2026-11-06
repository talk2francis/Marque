'use client'
import { useEffect, useMemo, useState } from 'react'
import { validateTask, YIELD_ASSETS, GRID_PAIRS } from '@marque/commerce/client'
import type { TaskValue } from '../_components/hire/TaskForm'
import { Field, SelectField } from '../_components/ui/Field'
import styles from './position-task.module.css'
const NUMERIC = new Set(['targetHf', 'targetRangePct', 'amount', 'holdingDays', 'currentAprPct', 'thresholdPp', 'lower', 'upper', 'capitalUsd', 'levels', 'stop'])

/** Position links fill only this quote-comparison form. The frozen Hire Sheet is unchanged. */
export function PositionTask({ category, initialFields, disabled, onChange, onReset }: { category: string; initialFields: Record<string, string>; disabled: boolean; onChange: (v: TaskValue) => void; onReset: () => void }) {
  const [fields, setFields] = useState<Record<string, string>>(() => ({ ...initialFields, ...(category === 'rebalancing' && !initialFields.targetRangePct ? { targetRangePct: '5' } : {}), ...(category === 'grid' && !initialFields.levels ? { levels: '10' } : {}) }))
  const definitions: Array<[string, string]> = category === 'health_factor' ? [['address', 'Account to check'], ['targetHf', 'Restore health factor to']]
    : category === 'rebalancing' ? [[fields.positionId ? 'positionId' : 'pool', fields.positionId ? 'PancakeSwap V3 position' : 'PancakeSwap pool'], ['address', 'Position owner'], ['targetRangePct', 'Range width, percent'], ...(fields.policy ? [['policy', 'Your policy'] as [string, string]] : [])]
      : category === 'yield' ? [['amount', 'Amount'], ['asset', 'Stablecoin'], ['holdingDays', 'Holding period, days'], ...(fields.currentAprPct !== undefined ? [['currentAprPct', 'Current APR, percent'] as [string, string]] : []), ...(fields.thresholdPp !== undefined ? [['thresholdPp', 'Minimum improvement, percentage points'] as [string, string]] : [])]
        : [[fields.pool && !fields.pair ? 'pool' : 'pair', fields.pool && !fields.pair ? 'PancakeSwap pool' : 'Pair against USDT'], ['lower', 'Lower price'], ['upper', 'Upper price'], ['capitalUsd', 'Capital, USDT'], ...(fields.levels ? [['levels', 'Number of levels'] as [string, string]] : []), ...(fields.spacing ? [['spacing', 'Spacing'] as [string, string]] : []), ...(fields.stop ? [['stop', 'Stop price'] as [string, string]] : [])]
  const result = useMemo(() => validateTask(category, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, NUMERIC.has(key) ? Number(value) : value]))), [category, fields])
  useEffect(() => { onChange(result.ok ? { task: result.sentence, ready: true, missing: null, structured: { category, fields: result.fields } } : { task: '', ready: false, missing: `Add ${result.missing.join(' and ')}.`, structured: null }) }, [result, onChange, category])
  return <fieldset className={styles.form} disabled={disabled}>
    <legend>Review this task</legend>
    <p className={styles.help}>These inputs came from the position or answer you opened. Review them before asking for fresh prices. An old pinned block is not copied into this new request.</p>
    <div className="taskform-grid">{definitions.map(([key, label]) => key === 'asset' || key === 'pair' || key === 'spacing'
      ? <SelectField key={key} label={label} value={fields[key] ?? ''} onChange={value => setFields(v => ({ ...v, [key]: value }))} options={(key === 'asset' ? YIELD_ASSETS : key === 'pair' ? GRID_PAIRS : ['arithmetic', 'geometric']).map(value => ({ value, label: value }))} />
      : <Field key={key} label={label} value={fields[key] ?? ''} onChange={value => setFields(v => ({ ...v, [key]: value }))} disabled={disabled} kind={NUMERIC.has(key) ? 'number' : key === 'address' || key === 'pool' ? 'mono' : 'text'} />
    )}</div>
    <button type="button" className="taskform-link" onClick={onReset}>Choose a different task</button>
  </fieldset>
}
