import { useState } from 'react'
import { DetailSection, DetailSections, Metadata } from '../../components/detail-sections'
import type { Topology } from '../../lib/graph.types'
import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Label } from '../../ui/label'
import type { CostReport } from './costs'
import { EstimateCell, FeeDetails, Issues, QuantityInput, Sources, formatEstimate, leftCellClass, rightCellClass, quantityFormat } from './workflow-estimate'
import type { WorkflowSide } from './workflows'
import { filterCostEntries, workflowBasisLabels, workflowBreakdown, workflowEstimate, workflowOperations } from './workflow-table'
import type { WorkflowBasis, WorkflowRow } from './workflow-table'
import { defaultWorkflowTableFilter, WorkflowBasisSelect, WorkflowTableControls } from './workflow-table-controls'

export function WorkflowDetail({ row, current, report, side, onEdit, onGraph, basis, setBasis, colorByCost, setColorByCost }: {
  row: WorkflowRow
  current: WorkflowSide
  report: CostReport
  side: Topology
  onEdit: (key: string, value: string) => void
  onGraph: () => void
  basis: WorkflowBasis
  setBasis: (basis: WorkflowBasis) => void
  colorByCost: boolean
  setColorByCost: (checked: boolean) => void
}) {
  const [filter, setFilter] = useState(defaultWorkflowTableFilter)
  const breakdown = workflowBreakdown(row, current, basis)
  const total = workflowEstimate(row, basis)
  let runs: number | null = 1
  if (basis === 'month') runs = row.runs
  else if (basis === 'million') runs = 1_000_000
  const stepNames = new Map(row.steps.map(({ id, label }) => [id, label]))
  const source = report.workflows!
  const snapshot = side === 'before' ? source.baseline : source.target
  const operations = filterCostEntries(workflowOperations(row, breakdown), filter.query, filter.pricing, filter.order)
  const grouped = filter.order === 'report'
  const byStep = new Map<string, typeof operations>()
  if (grouped) {
    for (const operation of operations) {
      const group = byStep.get(operation.step.id)
      if (group) group.push(operation)
      else byStep.set(operation.step.id, [operation])
    }
  }
  const steps = grouped ? row.steps.filter((step) => byStep.has(step.id)
    || (!step.fees.length && !filter.query.trim() && filter.pricing === 'all')) : []

  const renderOperation = ({ step, fee, estimate }: typeof operations[number]) => {
    const quantity = runs === 0 ? 0 : fee.quantity === null || runs === null ? null : fee.quantity * runs
    const amount = quantity === null ? '—' : quantityFormat.format(quantity)
    const unit = quantity !== null && fee.unit ? ' ' + fee.unit : ''
    return (
      <tr key={fee.id} className={grouped ? undefined : 'border-b'}>
        <th scope="row" className={`${leftCellClass} font-normal`}>
          {fee.label}
          {!grouped && <span className="block text-xs text-muted-foreground">{step.label}</span>}
        </th>
        <td className={rightCellClass}>{amount}{unit}</td>
        <EstimateCell value={estimate} precise={basis === 'one'} />
      </tr>
    )
  }

  return (
    <section className="space-y-3" aria-label="Selected workflow">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-tight wrap-anywhere">{row.workflow.label}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="flex min-h-8 items-center gap-2 text-xs">
            <Checkbox checked={colorByCost} onCheckedChange={(checked) => setColorByCost(checked === true)} />
            Color graph by cost
          </Label>
          <Button type="button" size="sm" variant="outline" onClick={onGraph}>Show graph</Button>
        </div>
      </div>
      {row.state ? <>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 [&>dl]:mb-0">
            <Metadata rows={[
              [workflowBasisLabels[basis], formatEstimate(total, basis === 'one')],
              ['Runs / month', row.runs === null ? 'Unknown' : quantityFormat.format(row.runs)],
            ]} />
          </div>
          <WorkflowBasisSelect label="Breakdown basis" value={basis} onChange={setBasis} />
        </div>
        <WorkflowTableControls filter={filter} onChange={setFilter} />
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Workflow operations">
          <table className="w-full">
            <thead className="border-y text-xs text-muted-foreground"><tr>
              <th scope="col" className={leftCellClass}>Step / Operation</th>
              <th scope="col" className={rightCellClass}>Quantity</th><th scope="col" className={rightCellClass}>Cost</th>
            </tr></thead>
            {steps.map((step) => <tbody key={step.id}>
              <tr className="border-t bg-white/5"><th colSpan={3} scope="rowgroup" className={leftCellClass}>
                {step.label}
                {!step.resourceId && !step.issue && <span className="ml-1 text-xs font-normal text-muted-foreground">External</span>}
              </th></tr>
              {byStep.get(step.id)?.map(renderOperation)}
            </tbody>)}
            {!grouped && operations.length > 0 && <tbody>{operations.map(renderOperation)}</tbody>}
            {!steps.length && !operations.length && (
              <tbody><tr><td colSpan={3} className={leftCellClass}>No operations found.</td></tr></tbody>
            )}
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
