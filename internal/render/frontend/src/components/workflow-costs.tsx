import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CostReport, Estimate, Tier } from '../lib/costs'
import type { ServiceIcons, Topology } from '../lib/graph.types'
import type { PricedFee, WorkflowEdits, WorkflowFee, WorkflowSelection, WorkflowSide } from '../lib/workflows'
import { buildWorkflowSide, maxWorkflowInput, workflowUserPresets } from '../lib/workflows'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { serviceFor } from '../lib/graph-projection'
import { serviceIconSrc } from '../lib/graph-view'
import { Accordion } from '../ui/accordion'
import { Icon } from '../ui/icon'
import { CostStatusTooltip } from './cost-status-tooltip'
import { CatalogRates } from './catalog-rates'
import { DetailSection } from './detail-section'
import { Metadata } from './metadata'
import { inspectorStyles } from './inspector.variants'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { NativeSelect } from '../ui/native-select'

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 12 })
const summaryUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const runUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 4 })
const units = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 })
const summaryAmount = (amount: number) => {
  if (amount > 0 && amount < 0.01) return '<$0.01'
  if (amount < 0 && amount > -0.01) return '−<$0.01'
  return summaryUSD.format(amount)
}
const price = (value: Estimate, precise = false) => value.priced
  ? (precise && value.amount !== 0 ? runUSD.format(value.amount) : summaryAmount(value.amount)) + (value.missing.length ? ' · Partial' : '') : value.missing.length ? 'Unavailable' : '—'
const right = 'px-1.5 py-2 text-right tabular-nums align-top sm:px-2'
const left = 'px-1.5 py-2 text-left align-top sm:px-2'

const QuantityInput = ({ label, value, onChange }: {
  label: string; value: number | null; onChange: (value: string) => void
}) => (
  <label className="grid min-w-24 gap-1 text-xs text-muted-foreground">
    <span>{label}</span>
    <Input type="number" className="h-7" min={0} max={maxWorkflowInput} step="any"
      value={value ?? ''} placeholder="Unknown" onChange={(event) => onChange(event.currentTarget.value)} />
  </label>
)

const Sources = ({ evidence }: { evidence?: string[] }) => evidence?.length ? (
  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
    {evidence.map((source, index) => <li className="break-words" key={index}><code>{source}</code></li>)}
  </ul>
) : null

const Issues = ({ reasons }: { reasons?: string[] }) => reasons?.length ? (
  <ul className="my-1 space-y-1 break-words text-xs text-amber-300">
    {[...new Set(reasons)].map((reason) => <li key={reason}>{reason}</li>)}
  </ul>
) : null

const TierFormula = ({ pool, tiers }: { pool: number; tiers: Tier[] }) => {
  let previous = 0
  return (
    <span>
      {tiers.flatMap(({ upTo, price }, index) => {
        const upper = upTo ?? pool
        const used = Math.max(0, Math.min(upper, pool) - previous)
        previous = upper
        return used > 0 ? [
          <span key={index}>{index > 0 && ' + '}{units.format(used)} × {dollars.format(price)}</span>,
        ] : []
      })}
    </span>
  )
}

const FeeDetails = ({ fee, priced, rates, runs, onEdit }: {
  fee: WorkflowFee; priced: PricedFee; rates: CostReport['rates']; runs: number | null
  onEdit: (key: string, value: string) => void
}) => (
  <div className="border-t py-2">
    <div className="flex justify-between gap-3">
      <span className="break-words font-medium">{fee.label}</span>
      <span className="text-right tabular-nums">{price(priced.estimate, true)}</span>
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
              <>{fee.factors.map((factor) => units.format(factor.value ?? 0)).join(' × ')}
                {conversion !== undefined && conversion !== 1 && ' × ' + units.format(conversion)}
                {runs !== 1 && ' × ' + units.format(runs)} = </>)}
            {units.format(use.units)} {unit}
          </p>
          {use.pool > 0 && (
            <p>
              Rate tiers {use.units !== use.pool && '('}<TierFormula pool={use.pool} tiers={rates[use.rate]} />
              {use.units !== use.pool && <>) × ({units.format(use.units)} ÷ {units.format(use.pool)})</>}
              {' = ' + dollars.format(use.amount)}
            </p>
          )}
        </div>
      )
    })}
    <Sources evidence={fee.evidence} />
  </div>
)

const zero: Estimate = { amount: 0, priced: true, missing: [] }
const emptyCosts = { fixed: zero, usage: zero, monthly: zero }
const signedUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' })

const EstimateCell = ({ value, before, precise = false }: {
  value: Estimate; before?: Estimate; precise?: boolean
}) => {
  const delta = before?.priced && value.priced && !before.missing.length && !value.missing.length
    ? value.amount - before.amount : 0
  return (
    <td className={right}>
      <span className="inline-flex items-center whitespace-nowrap">
        {value.priced ? (precise && value.amount !== 0 ? runUSD.format(value.amount) : summaryAmount(value.amount)) : '—'}
        <CostStatusTooltip value={value} />
      </span>
      {Math.abs(delta) > 1e-9 && (
        <span aria-label={`Monthly change ${signedUSD.format(delta)}`} title="Change from Before"
          className={`block whitespace-nowrap text-[11px] ${delta > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>
          {Math.abs(delta) < 0.01 ? (delta > 0 ? '+<$0.01' : '−<$0.01') : signedUSD.format(delta)}
        </span>
      )}
    </td>
  )
}

const WorkflowServices = ({ current, other, previous, report, icons, onEdit, side }: {
  current: WorkflowSide; other?: WorkflowSide; previous?: WorkflowSide; report: CostReport
  icons: ServiceIcons; side: Topology; onEdit: (key: string, value: string) => void
}) => {
  const rows = [...new Set([...current.services.keys(), ...(other?.services.keys() ?? [])])]
    .map((service) => ({
      service,
      display: service ? serviceFor({ provider: 'aws', service }) : undefined,
    }))
    .sort((a, b) => (a.display?.name ?? 'Unattributed').localeCompare(b.display?.name ?? 'Unattributed'))
  const snapshotIssues = side === 'before' ? report.beforeIssues ?? [] : []
  const unavailable: Estimate = { amount: 0, priced: false, missing: snapshotIssues }
  const fallback = snapshotIssues.length ? { fixed: unavailable, usage: unavailable, monthly: unavailable } : emptyCosts
  const renderCosts = (costs: typeof emptyCosts, before?: Estimate) => <>
    <EstimateCell value={costs.fixed} />
    <EstimateCell value={costs.usage} />
    <EstimateCell value={costs.monthly} before={before} />
  </>
  return (
    <div className="space-y-3">
      <div role="region" aria-label="Service costs">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
            <tr><th scope="col" className={left}>Service</th><th scope="col" className={right}>Fixed</th>
              <th scope="col" className={right}>Usage</th><th scope="col" className={right}>Monthly</th></tr>
          </thead>
          <tbody>
            {rows.map(({ service, display }) => {
              const icon = display && serviceIconSrc({ ...display, icon: service }, icons)
              return <tr key={service} className="border-b">
                <th scope="row" className={left}>
                  <span className="flex items-center gap-1.5 font-medium">
                    {icon && <img src={icon} className="size-4 shrink-0" alt="" />}
                    {display?.name ?? 'Unattributed'}
                  </span>
                </th>
                {renderCosts(current.services.get(service) ?? fallback,
                  previous && (previous.services.get(service)?.monthly ?? (report.beforeIssues?.length ? undefined : zero)))}
              </tr>
            })}
            {!rows.length && <tr><td colSpan={4} className={left}>No modeled service costs.</td></tr>}
          </tbody>
          <tfoot className="font-semibold">
            <tr><th scope="row" className={left}>Total</th>{renderCosts(current.totals, previous?.totals.monthly)}</tr>
          </tfoot>
        </table>
      </div>
      {(current.shared.length > 0 || current.baseline.length > 0) && (
        <Accordion type="multiple" className={inspectorStyles.sections}>
          <DetailSection value="fixed" title="Fixed and shared cost details">
            {current.shared.map(({ id, label, evidence, issue, fees }) => (
              <section className="mt-2" key={id}>
                <h3 className="font-medium">{label}</h3><Sources evidence={evidence} /><Issues reasons={issue ? [issue] : []} />
                {fees.map((entry) => <FeeDetails key={entry.id} fee={entry} priced={current.month.priced.get(entry.id)!}
                  rates={report.rates} runs={1} onEdit={onEdit} />)}
              </section>
            ))}
            {current.baseline.map((entry) => <FeeDetails key={entry.id} fee={entry} priced={current.month.priced.get(entry.id)!}
              rates={report.rates} runs={1} onEdit={onEdit} />)}
          </DetailSection>
        </Accordion>
      )}
      {report.catalogs && <CatalogRates catalogs={report.catalogs} />}
    </div>
  )
}

const WorkflowDetail = ({ row, current, report, side, onEdit, onGraph }: {
  row: NonNullable<ReturnType<WorkflowSide['workflows']['get']>>
  current: WorkflowSide; report: CostReport; side: Topology
  onEdit: (key: string, value: string) => void; onGraph: () => void
}) => {
  const [basis, setBasis] = useState<'one' | 'million' | 'month'>('one')
  const breakdown = basis === 'month' ? current.month : row[basis]
  const total = basis === 'month' ? row.month : row[basis].total
  const runs = basis === 'month' ? row.runs : basis === 'million' ? 1_000_000 : 1
  const stepNames = new Map(row.steps.map(({ id, label }) => [id, label]))
  const source = report.workflows!
  const snapshot = side === 'before' ? source.baseline : source.target
  return (
    <section className="space-y-3" aria-label="Selected workflow">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-tight wrap-anywhere">{row.workflow.label}</h3>
        <Button type="button" size="sm" variant="outline" onClick={onGraph}>Show graph</Button>
      </div>
      {row.state ? <>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 [&>dl]:mb-0">
            <Metadata rows={[
              [basis === 'month' ? 'Monthly' : basis === 'one' ? 'Per run' : 'Per 1M', price(total, basis === 'one')],
              ['Runs / month', row.runs === null ? 'Unknown' : units.format(row.runs)],
            ]} />
          </div>
          <NativeSelect size="sm" aria-label="Breakdown basis" value={basis}
            onChange={(event) => setBasis(event.currentTarget.value as typeof basis)}>
            <option value="one">Per run</option><option value="million">Per 1M</option><option value="month">Monthly</option>
          </NativeSelect>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Workflow operations">
          <table className="w-full">
            <thead className="border-y text-xs text-muted-foreground"><tr>
              <th scope="col" className={left}>Step / Operation</th>
              <th scope="col" className={right}>Quantity</th><th scope="col" className={right}>Cost</th>
            </tr></thead>
            {row.steps.map((step) => <tbody key={step.id}>
              <tr className="border-t bg-white/5"><th colSpan={3} scope="rowgroup" className={left}>
                {step.label}
                {!step.resourceId && !step.issue && <span className="ml-1 text-xs font-normal text-muted-foreground">External</span>}
              </th></tr>
              {step.fees.map((entry) => {
                const quantity = runs === 0 ? 0 : entry.quantity === null || runs === null ? null : entry.quantity * runs
                return <tr key={entry.id}>
                  <th scope="row" className={`${left} font-normal`}>{entry.label}</th>
                  <td className={right}>{quantity === null ? '—' : units.format(quantity)}{entry.unit && quantity !== null && ' ' + entry.unit}</td>
                  <EstimateCell value={breakdown.priced.get(entry.id)!.estimate} precise={basis === 'one'} />
                </tr>
              })}
            </tbody>)}
          </table>
        </div>
        <Accordion type="multiple" className={inspectorStyles.sections}>
          <DetailSection value="assumptions" title="Usage assumptions">
            <QuantityInput label="Runs per user / month" value={row.frequency}
              onChange={(value) => onEdit(row.frequencyKey, value)} />
            {row.state.frequencyEvidence && <p className="mt-1 text-xs text-muted-foreground">{row.state.frequencyEvidence}</p>}
            {row.steps.filter(({ fees }) => fees.length).map(({ id, label, fees }) => (
              <section key={id} className="mt-3">
                <h4 className="font-medium">{label}</h4>
                {fees.map((entry) => <FeeDetails key={entry.id} fee={entry} priced={breakdown.priced.get(entry.id)!}
                  rates={report.rates} runs={runs} onEdit={onEdit} />)}
              </section>
            ))}
          </DetailSection>
          <DetailSection value="evidence" title="Evidence and coverage">
            <Issues reasons={total.missing} />
            <Sources evidence={[source.scenario, snapshot, ...(row.state.findings ?? [])].filter((value): value is string => Boolean(value))} />
            {row.steps.filter(({ evidence }) => evidence?.length).map(({ id, label, evidence }) => (
              <div key={id} className="mt-2"><h4 className="text-xs font-medium">{label}</h4><Sources evidence={evidence} /></div>
            ))}
            {row.state.links?.filter(({ evidence }) => evidence?.length).map(({ from, to, evidence }) => (
              <div key={JSON.stringify([from, to])} className="mt-2">
                <h4 className="text-xs font-medium">{stepNames.get(from)} → {stepNames.get(to)}</h4>
                <Sources evidence={evidence} />
              </div>
            ))}
          </DetailSection>
        </Accordion>
      </> : <p className="text-xs text-muted-foreground">Absent in this snapshot.</p>}
    </section>
  )
}

export const WorkflowCosts = ({
  report, icons, edits, onEdit, tab, setTab, selection, side, onSide, onSelect, onClear, onGraph, bodyRef,
}: {
  report: CostReport; icons: ServiceIcons; edits: WorkflowEdits; onEdit: (key: string, value: string) => void
  tab: 'services' | 'workflows'; setTab: (tab: 'services' | 'workflows') => void
  selection?: WorkflowSelection; side: Topology; onSide: (side: Topology) => void
  onSelect: (selection: WorkflowSelection) => void; onClear: () => void; onGraph: () => void
  bodyRef: { current: HTMLDivElement | null }
}) => {
  const after = useMemo(() => buildWorkflowSide(report, 'after', edits), [report, edits])
  const before = useMemo(() => report.before ? buildWorkflowSide(report, 'before', edits) : undefined, [report, edits])
  const current = side === 'before' && before ? before : after
  const previous = side === 'after' ? before : undefined
  const row = tab === 'workflows' && selection ? current.workflows.get(selection.id) : undefined
  const back = useRef<HTMLButtonElement>(null)
  const selectedId = row?.workflow.id
  const previousId = useRef<string>(undefined)
  const list = useRef<HTMLTableElement>(null)
  useLayoutEffect(() => {
    if (selectedId) {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
      back.current?.focus({ preventScroll: true })
    } else if (previousId.current) {
      const button = [...(list.current?.querySelectorAll<HTMLButtonElement>('button[data-workflow]') ?? [])]
        .find((element) => element.getAttribute('data-workflow') === previousId.current)
      button?.focus()
    }
    previousId.current = selectedId
  }, [selectedId, bodyRef])

  return (
    <>
      <div className="shrink-0 space-y-2 border-b bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Monthly active users
            <Input type="number" className="h-8 w-24" min={0} max={maxWorkflowInput} step="any"
              value={current.users ?? ''} placeholder="Unknown" onChange={(event) => onEdit('users', event.currentTarget.value)} />
          </label>
          <div className="flex gap-1" role="group" aria-label="Active user presets">
            {workflowUserPresets.map(({ value, label }) => (
              <Button key={value} type="button" size="sm" variant={current.users === value ? 'secondary' : 'outline'}
                aria-pressed={current.users === value} onClick={() => onEdit('users', String(value))}>{label}</Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1" role="group" aria-label="Cost view">
            {(['services', 'workflows'] as const).map((choice) => (
              <Button key={choice} type="button" size="sm" variant={tab === choice ? 'secondary' : 'ghost'}
                aria-pressed={tab === choice} onClick={() => { setTab(choice); onClear() }}>
                {choice === 'services' ? 'Services' : 'Workflows'}
              </Button>
            ))}
          </div>
          {before && <div className="flex gap-1" role="group" aria-label="Cost snapshot">
            {(['before', 'after'] as const).map((state) => (
              <Button key={state} type="button" size="sm" variant={side === state ? 'secondary' : 'ghost'}
                aria-pressed={side === state} onClick={() => onSide(state)}>{state === 'before' ? 'Before' : 'After'}</Button>
            ))}
          </div>}
        </div>
      </div>
      <div ref={bodyRef} className="min-h-0 overflow-auto overscroll-contain px-3 pb-2" tabIndex={0} aria-label="Cost estimates">
        {tab === 'services' ? <WorkflowServices current={current} other={side === 'before' ? after : before} previous={previous}
          report={report} icons={icons} side={side} onEdit={onEdit} /> : row ? <>
          <Button ref={back} type="button" size="sm" variant="ghost" className="mb-2" onClick={onClear}>
            <Icon icon={ArrowLeft} size={14} /> All workflows
          </Button>
          <WorkflowDetail key={row.workflow.id} row={row} current={current} report={report}
            side={side} onEdit={onEdit} onGraph={onGraph} />
        </> : (
          <div className="overflow-x-auto" role="region" aria-label="Workflow costs" tabIndex={0}>
            <table ref={list} className="w-full">
              <thead className="border-y text-xs text-muted-foreground"><tr>
                <th scope="col" className={left}>Workflow</th><th scope="col" className={right}>Per run</th>
                <th scope="col" className={right}>Per 1M</th><th scope="col" className={right}>Monthly</th>
              </tr></thead>
              <tbody>
                {[...current.workflows.values()].map((entry) => <tr key={entry.workflow.id} className="cursor-pointer border-b hover:bg-white/5"
                  onClick={() => onSelect({ id: entry.workflow.id, side })}>
                  <th scope="row" className="p-0 text-left">
                    <Button data-workflow={entry.workflow.id} type="button" variant="ghost" size="sm"
                      className="h-auto min-h-9 w-full justify-between whitespace-normal px-1.5 text-left wrap-anywhere sm:px-2">
                      {entry.workflow.label}<Icon icon={ChevronRight} size={13} className="shrink-0 text-muted-foreground" />
                    </Button>
                  </th>
                  <EstimateCell value={entry.state ? entry.one.total : { ...zero, priced: false }} precise />
                  <EstimateCell value={entry.state ? entry.million.total : { ...zero, priced: false }} />
                  <EstimateCell value={entry.month} before={previous?.workflows.get(entry.workflow.id)?.month} />
                </tr>)}
                {!current.workflows.size && <tr><td colSpan={4} className={left}>No workflows found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
