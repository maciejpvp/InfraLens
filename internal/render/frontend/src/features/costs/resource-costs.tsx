import { DollarSign } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useId, useMemo } from 'react'
import { segmentButtonClass, segmentedControlClass } from '../../components/overlay-styles'
import { serviceFor } from '../../lib/graph-projection'
import { serviceIconSrc } from '../../lib/graph-view'
import type { ServiceIcons, Topology } from '../../lib/graph.types'
import { cn } from '../../lib/utils'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { Input } from '../../ui/input'
import type { CostReport, Costs, Estimate, Scenario } from './costs'
import { assumptionKey, assumptions, calculateCosts, initialAssumption, usageAssumptions } from './costs'
import { CatalogRates, CostStatusTooltip } from './estimate-details'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const signedCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'exceptZero' })
const cell = 'px-2 py-2 text-right align-top tabular-nums'
const metrics = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'usage', label: 'Per 1M' },
] as const
const modes = ['Before', 'After', 'Compare'] as const
export type CostComparisonMode = typeof modes[number]

const amountText = (amount: number) => amount > 0 && amount < 0.01 ? '<$0.01' : currency.format(amount)

function CostValue({ value }: { value: Estimate }) {
  return (
    <td className={cell}>
      <span className="inline-flex items-center whitespace-nowrap">
        {value.priced ? amountText(value.amount) : '—'}
        <CostStatusTooltip value={value} />
      </span>
    </td>
  )
}

function Difference({ before, after }: { before: Estimate; after: Estimate }) {
  const available = before.missing.length === 0 && after.missing.length === 0
  const raw = after.amount - before.amount
  const delta = Math.abs(raw) < 1e-9 ? 0 : raw
  let label = signedCurrency.format(delta)
  if (delta !== 0 && Math.abs(delta) < 0.01) {
    label = delta > 0 ? '<$0.01 more' : '<$0.01 less'
  }
  return (
    <td className={cn(cell, available && delta > 0 && 'text-orange-300', available && delta < 0 && 'text-emerald-300')}>
      {available ? label : <span aria-label="Difference unavailable">—</span>}
    </td>
  )
}

function CostCells({ mode, before, after }: { mode: CostComparisonMode; before: Costs; after: Costs }) {
  if (mode === 'Compare') {
    return metrics.map(({ id }) => <CostComparisonCells key={id} before={before[id]} after={after[id]} />)
  }

  const estimates = mode === 'Before' ? before : after
  return metrics.map(({ id }) => <CostValue key={id} value={estimates[id]} />)
}

function CostComparisonCells({ before, after }: { before: Estimate; after: Estimate }) {
  return (
    <>
      <CostValue value={before} />
      <CostValue value={after} />
      <Difference before={before} after={after} />
    </>
  )
}

type ResourceCostsProps = {
  report: CostReport
  icons: ServiceIcons
  mode: CostComparisonMode
  setMode: (mode: CostComparisonMode) => void
  scenario: Scenario
  setScenario: Dispatch<SetStateAction<Scenario>>
}

export function ResourceCosts({ report, icons, mode, setMode, scenario, setScenario }: ResourceCostsProps) {
  const { rows: sorted, total } = useMemo(() => {
    const { rows, total } = calculateCosts(report, scenario)
    const sortedRows = rows.map((row) => ({
      ...row,
      display: serviceFor({ provider: 'aws', service: row.service }),
    })).sort((a, b) => a.display.name.localeCompare(b.display.name))
    return { rows: sortedRows, total }
  }, [report, scenario])
  const compare = mode === 'Compare'
  let assumptionsSide: Topology | undefined
  if (mode === 'Before') assumptionsSide = 'before'
  if (mode === 'After') assumptionsSide = 'after'

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          USD{report.regions?.length ? ' · ' + report.regions.join(', ') : ''}
          {report.fallback && ` · Fallback region ${report.fallback}`}
        </p>
        {report.before && (
          <div role="group" aria-label="Cost comparison" className={segmentedControlClass}>
            {modes.map((choice) => (
              <Button
                key={choice} type="button" size="sm" variant={mode === choice ? 'secondary' : 'ghost'}
                aria-pressed={mode === choice} className={segmentButtonClass}
                onClick={() => setMode(choice)}
              >
                {choice}
              </Button>
            ))}
          </div>
        )}
      </div>
      {mode !== 'After' && report.beforeIssues?.map((issue) => (
        <p key={issue} className="mb-2 max-w-80 text-xs text-amber-300">{issue}</p>
      ))}
      <div role="region" className="overflow-x-auto" tabIndex={compare ? 0 : undefined} aria-label="AWS cost table">
        <table className="w-full border-collapse text-sm">
          {compare && <><colgroup span={1} /><colgroup span={3} /><colgroup span={3} /></>}
          <thead className="border-y text-xs text-muted-foreground">
            <tr>
              <th rowSpan={compare ? 2 : 1} scope="col" className="min-w-28 p-2 text-left">Service</th>
              {metrics.map(({ id, label }) => (
                <th key={id} scope={compare ? 'colgroup' : 'col'} colSpan={compare ? 3 : 1} className={cell}>{label}</th>
              ))}
            </tr>
            {compare && (
              <tr>
                {metrics.flatMap(({ id }) => ['Before', 'After', 'Difference'].map((label) => (
                  <th key={id + label} scope="col" className={cell}>{label}</th>
                )))}
              </tr>
            )}
          </thead>
          <tbody>
            {sorted.map(({ service, display, before, after }) => {
              const icon = serviceIconSrc({ ...display, icon: service }, icons)
              return (
                <tr key={service} className="border-b">
                  <th scope="row" className="p-2 text-left align-top font-medium">
                    <span className="flex items-center gap-2">
                      {icon ? <img src={icon} alt="" className="size-5 shrink-0" /> : <Icon icon={DollarSign} size={16} />}
                      {display.name}
                    </span>
                  </th>
                  <CostCells mode={mode} before={before} after={after} />
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={compare ? 7 : 3} className="p-2 text-muted-foreground">No AWS resources found.</td></tr>
            )}
          </tbody>
          <tfoot className="font-semibold">
            <tr><th scope="row" className="p-2 text-left align-top">Total</th><CostCells mode={mode} {...total} /></tr>
          </tfoot>
        </table>
      </div>
      {report.catalogs && <CatalogRates catalogs={report.catalogs} />}
      <CostAssumptions
        report={report} scenario={scenario} setScenario={setScenario}
        side={assumptionsSide}
      />
    </>
  )
}

function CostAssumptions({
  report, scenario, setScenario, side,
}: {
  report: CostReport
  scenario: Scenario
  setScenario: Dispatch<SetStateAction<Scenario>>
  side?: Topology
}) {
  const inputId = useId()
  const imported = report.usageAssumptions
  const split = Boolean(imported && report.before)
  const panels = useMemo(() => {
    let sides: (Topology | undefined)[] = [undefined]
    if (split) sides = side ? [side] : ['before', 'after']
    return sides.map((state) => ({ state, controls: usageAssumptions(report, state) }))
  }, [report, side, split])
  if (!imported && !panels.some(({ controls }) => controls.length)) return null

  return (
    <details className="mt-3 border-t pt-2">
      <summary className="cursor-pointer font-medium">
        Usage assumptions{imported && ' · Imported'}
      </summary>
      {imported?.scenario && <p className="mt-2 max-w-96 break-words text-xs">{imported.scenario}</p>}
      <p className="my-2 max-w-96 text-xs text-muted-foreground">
        Enter billable operations or units for one incoming request.
        {split ? ' Each state can use different values.' : report.before && ' Both states use the same assumptions.'}
      </p>
      {imported?.warnings?.length ? (
        <ul className="mb-2 max-w-96 space-y-1 text-xs text-amber-300">
          {imported.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
      {panels.map(({ state, controls }) => {
        const source = state === 'before' ? imported?.baseline : imported?.target
        return (
          <section key={state ?? 'shared'} className="mb-2">
            {state && <h3 className="pt-1 font-medium">{state === 'before' ? 'Before' : 'After'}</h3>}
            {source && <p className="my-1 max-w-96 break-words text-xs text-muted-foreground">Assumptions source {source}</p>}
            {controls.map(({ item, inputs }) => (
              <fieldset key={item.id} className="flex flex-wrap gap-2 border-t py-1">
                <legend className="max-w-60 break-words pr-2 text-xs">{item.name}</legend>
                {[...inputs].map((input) => {
                  const key = assumptionKey(item.id, input, state)
                  const { label, max } = assumptions[input]
                  const initial = initialAssumption(item, input)
                  const id = inputId + key
                  return (
                    <label key={input} htmlFor={id} className="grid w-36 gap-1 text-xs text-muted-foreground">
                      {label}
                      <Input
                        id={id} type="number" min={0} max={max} step="any" value={scenario[key] ?? initial}
                        placeholder={String(initial)} className="h-8"
                        onChange={(event) => {
                          const value = event.target.value
                          setScenario((previous) => ({ ...previous, [key]: value && Number(value) > max ? String(max) : value }))
                        }}
                      />
                    </label>
                  )
                })}
              </fieldset>
            ))}
          </section>
        )
      })}
    </details>
  )
}
