import { Input } from '../../ui/input'
import type { CostReport, Estimate, Tier } from './costs'
import { CostStatusTooltip } from './estimate-details'
import type { PricedFee, WorkflowFee } from './workflows'
import { maxWorkflowInput } from './workflows'

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 12 })
const summaryUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const runUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 4 })
export const quantityFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 })
const summaryAmount = (amount: number) => {
  if (amount > 0 && amount < 0.01) return '<$0.01'
  if (amount < 0 && amount > -0.01) return '−<$0.01'
  return summaryUSD.format(amount)
}
function formatAmount(amount: number, precise: boolean) {
  return precise && amount !== 0 ? runUSD.format(amount) : summaryAmount(amount)
}

export function formatEstimate(value: Estimate, precise = false) {
  if (!value.priced) return value.missing.length ? 'Unavailable' : '—'

  const amount = formatAmount(value.amount, precise)
  return value.missing.length ? amount + ' · Partial' : amount
}
export const rightCellClass = 'px-2 py-1.5 text-right tabular-nums align-top'
export const leftCellClass = 'px-2 py-1.5 text-left align-top'

export function QuantityInput({ label, value, onChange }: {
  label: string; value: number | null; onChange: (value: string) => void
}) {
  return (
    <label className="grid min-w-24 gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input type="number" className="h-7" min={0} max={maxWorkflowInput} step="any"
        value={value ?? ''} placeholder="Unknown" onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  )
}

export function Sources({ evidence }: { evidence?: string[] }) {
  return evidence?.length ? (
    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
      {evidence.map((source, index) => <li className="break-words" key={index}><code>{source}</code></li>)}
    </ul>
  ) : null
}

export function Issues({ reasons }: { reasons?: string[] }) {
  if (!reasons?.length) return null

  return (
    <ul className="my-1 space-y-1 break-words text-xs text-cost-warning">
      {[...new Set(reasons)].map((reason) => <li key={reason}>{reason}</li>)}
    </ul>
  )
}

function TierFormula({ pool, tiers }: { pool: number; tiers: Tier[] }) {
  let previous = 0
  return (
    <span>
      {tiers.flatMap(({ upTo, price }, index) => {
        const upper = upTo ?? pool
        const used = Math.max(0, Math.min(upper, pool) - previous)
        previous = upper
        return used > 0 ? [
          <span key={index}>{index > 0 && ' + '}{quantityFormat.format(used)} × {dollars.format(price)}</span>,
        ] : []
      })}
    </span>
  )
}

export function FeeDetails({ fee, priced, rates, runs, onEdit }: {
  fee: WorkflowFee; priced: PricedFee; rates: CostReport['rates']; runs: number | null
  onEdit: (key: string, value: string) => void
}) {
  return (
    <div className="border-t py-2">
      <div className="flex justify-between gap-3">
        <span className="break-words font-medium">{fee.label}</span>
        <span className="text-right tabular-nums">{formatEstimate(priced.estimate, true)}</span>
      </div>
      {fee.factors.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
          {fee.factors.map((factor) => (
            <QuantityInput key={factor.key} label={factor.unit ? factor.label + ' (' + factor.unit + ')' : factor.label}
              value={factor.value} onChange={(value) => onEdit(factor.key, value)} />
          ))}
        </div>
      )}
      {fee.note && <p className="mt-1 text-xs text-muted-foreground">{fee.note}</p>}
      <Issues reasons={priced.estimate.missing} />
      {priced.uses.map((use, index) => {
        const conversion = fee.uses[index]?.multiplier
        const [service, region, sku, ...unitParts] = use.rate.split('/')
        const unit = unitParts.join('/')
        return (
          <div key={use.rate + index} className="mt-2 space-y-1 break-words text-xs text-muted-foreground">
            <p>{service} · {region} · SKU {sku}</p>
            <p>
              {fee.factors.length > 0 && fee.quantity !== null && runs !== null && (
                <>{fee.factors.map((factor) => quantityFormat.format(factor.value ?? 0)).join(' × ')}
                  {conversion !== undefined && conversion !== 1 && ' × ' + quantityFormat.format(conversion)}
                  {runs !== 1 && ' × ' + quantityFormat.format(runs)} = </>)}
              {quantityFormat.format(use.units)} {unit}
            </p>
            {use.pool > 0 && (
              <p>
                Rate tiers {use.units !== use.pool && '('}<TierFormula pool={use.pool} tiers={rates[use.rate]} />
                {use.units !== use.pool && <>) × ({quantityFormat.format(use.units)} ÷ {quantityFormat.format(use.pool)})</>}
                {' = ' + dollars.format(use.amount)}
              </p>
            )}
          </div>
        )
      })}
      <Sources evidence={fee.evidence} />
    </div>
  )
}

const signedUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' })

export function EstimateCell({ value, before, precise = false }: {
  value: Estimate
  before?: Estimate
  precise?: boolean
}) {
  const delta = before?.priced && value.priced && !before.missing.length && !value.missing.length
    ? value.amount - before.amount : 0
  let changeLabel = signedUSD.format(delta)
  if (Math.abs(delta) < 0.01) changeLabel = delta > 0 ? '+<$0.01' : '−<$0.01'

  return (
    <td className={rightCellClass}>
      <span className="inline-flex items-center whitespace-nowrap">
        {value.priced ? formatAmount(value.amount, precise) : '—'}
        <CostStatusTooltip value={value} />
      </span>
      {Math.abs(delta) > 1e-9 && (
        <span aria-label={`Monthly change ${signedUSD.format(delta)}`} title="Change from Before"
          className={`block whitespace-nowrap text-[11px] ${delta > 0 ? 'text-cost-increase' : 'text-cost-decrease'}`}>
          {changeLabel}
        </span>
      )}
    </td>
  )
}
