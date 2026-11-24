import { useState } from 'react'
import { DetailSection, DetailSections, Metadata } from '../../components/detail-sections'
import type { Topology } from '../../lib/graph.types'
import { Button } from '../../ui/button'
import { NativeSelect } from '../../ui/native-select'
import type { CostReport } from './costs'
import { EstimateCell, FeeDetails, Issues, QuantityInput, Sources, formatEstimate, leftCellClass, rightCellClass, quantityFormat } from './workflow-estimate'
import type { WorkflowSide } from './workflows'

export function WorkflowDetail({ row, current, report, side, onEdit, onGraph }: {
  row: NonNullable<ReturnType<WorkflowSide['workflows']['get']>>
  current: WorkflowSide
  report: CostReport
  side: Topology
  onEdit: (key: string, value: string) => void
  onGraph: () => void
}) {
  const [basis, setBasis] = useState<'one' | 'million' | 'month'>('one')
  const breakdown = basis === 'month' ? current.month : row[basis]
  const total = basis === 'month' ? row.month : row[basis].total
  let runs: number | null = 1
  if (basis === 'month') runs = row.runs
  else if (basis === 'million') runs = 1_000_000
  const stepNames = new Map(row.steps.map(({ id, label }) => [id, label]))
  const basisLabel = { month: 'Monthly', one: 'Per run', million: 'Per 1M' }[basis]
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
              [basisLabel, formatEstimate(total, basis === 'one')],
              ['Runs / month', row.runs === null ? 'Unknown' : quantityFormat.format(row.runs)],
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
              <th scope="col" className={leftCellClass}>Step / Operation</th>
              <th scope="col" className={rightCellClass}>Quantity</th><th scope="col" className={rightCellClass}>Cost</th>
            </tr></thead>
            {row.steps.map((step) => <tbody key={step.id}>
              <tr className="border-t bg-white/5"><th colSpan={3} scope="rowgroup" className={leftCellClass}>
                {step.label}
                {!step.resourceId && !step.issue && <span className="ml-1 text-xs font-normal text-muted-foreground">External</span>}
              </th></tr>
              {step.fees.map((entry) => {
                let quantity: number | null = null
                if (runs === 0) quantity = 0
                else if (entry.quantity !== null && runs !== null) quantity = entry.quantity * runs
                const amount = quantity === null ? '—' : quantityFormat.format(quantity)
                const unit = quantity !== null && entry.unit ? ' ' + entry.unit : ''
                return <tr key={entry.id}>
                  <th scope="row" className={`${leftCellClass} font-normal`}>{entry.label}</th>
                  <td className={rightCellClass}>{amount}{unit}</td>
                  <EstimateCell value={breakdown.priced.get(entry.id)!.estimate} precise={basis === 'one'} />
                </tr>
              })}
            </tbody>)}
          </table>
        </div>
        <DetailSections type="multiple">
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
        </DetailSections>
      </> : <p className="text-xs text-muted-foreground">Absent in this snapshot.</p>}
    </section>
  )
}
