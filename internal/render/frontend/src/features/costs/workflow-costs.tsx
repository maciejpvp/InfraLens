import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { DetailSection, DetailSections } from '../../components/detail-sections'
import { serviceFor } from '../../lib/graph-projection'
import { serviceIconSrc } from '../../lib/graph-view'
import type { ServiceIcons, Topology } from '../../lib/graph.types'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { Input } from '../../ui/input'
import type { CostReport, Estimate } from './costs'
import { CatalogRates } from './estimate-details'
import { type WorkflowEdits, type WorkflowSelection, type WorkflowSide, buildWorkflowSide, maxWorkflowInput, workflowUserPresets } from './workflows'

import { WorkflowDetail } from './workflow-detail'
import { EstimateCell, FeeDetails, Issues, Sources, leftCellClass, rightCellClass } from './workflow-estimate'

export type CostTab = 'services' | 'workflows'

const zero: Estimate = { amount: 0, priced: true, missing: [] }
const emptyCosts = { fixed: zero, usage: zero, monthly: zero }
function WorkflowServices({ current, other, previous, report, icons, onEdit, side }: {
  current: WorkflowSide
  other?: WorkflowSide
  previous?: WorkflowSide
  report: CostReport
  icons: ServiceIcons
  side: Topology
  onEdit: (key: string, value: string) => void
}) {
  const rows = [...new Set([...current.services.keys(), ...(other?.services.keys() ?? [])])]
    .map((service) => ({
      service,
      display: service ? serviceFor({ provider: 'aws', service }) : undefined,
    }))
    .sort((a, b) => (a.display?.name ?? 'Unattributed').localeCompare(b.display?.name ?? 'Unattributed'))
  const snapshotIssues = side === 'before' ? report.beforeIssues ?? [] : []
  const unavailable: Estimate = { amount: 0, priced: false, missing: snapshotIssues }
  const fallback = snapshotIssues.length ? { fixed: unavailable, usage: unavailable, monthly: unavailable } : emptyCosts
  const missingServiceBefore = report.beforeIssues?.length ? undefined : zero

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
            <tr><th scope="col" className={leftCellClass}>Service</th><th scope="col" className={rightCellClass}>Fixed</th>
              <th scope="col" className={rightCellClass}>Usage</th><th scope="col" className={rightCellClass}>Monthly</th></tr>
          </thead>
          <tbody>
            {rows.map(({ service, display }) => {
              const icon = display && serviceIconSrc({ ...display, icon: service }, icons)
              const before = previous && (previous.services.get(service)?.monthly ?? missingServiceBefore)
              const estimate = current.services.get(service) ?? fallback
              return (
                <tr key={service} className="border-b">
                  <th scope="row" className={leftCellClass}>
                    <span className="flex items-center gap-1.5 font-medium">
                      {icon && <img src={icon} className="size-4 shrink-0" alt="" />}
                      {display?.name ?? 'Unattributed'}
                    </span>
                  </th>
                  {renderCosts(estimate, before)}
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={4} className={leftCellClass}>No modeled service costs.</td></tr>}
          </tbody>
          <tfoot className="font-semibold">
            <tr><th scope="row" className={leftCellClass}>Total</th>{renderCosts(current.totals, previous?.totals.monthly)}</tr>
          </tfoot>
        </table>
      </div>
      {(current.shared.length > 0 || current.baseline.length > 0) && (
        <DetailSections type="multiple">
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
        </DetailSections>
      )}
      {report.catalogs && <CatalogRates catalogs={report.catalogs} />}
    </div>
  )
}

export function WorkflowCosts({
  report, icons, edits, onEdit, tab, setTab, selection, side, onSide, onSelect, onClear, onGraph, bodyRef,
}: {
  report: CostReport
  icons: ServiceIcons
  edits: WorkflowEdits
  onEdit: (key: string, value: string) => void
  tab: CostTab
  setTab: (tab: CostTab) => void
  selection?: WorkflowSelection
  side: Topology
  onSide: (side: Topology) => void
  onSelect: (selection: WorkflowSelection) => void
  onClear: () => void
  onGraph: () => void
  bodyRef: RefObject<HTMLDivElement | null>
}) {
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

  let content: ReactNode
  if (tab === 'services') {
    content = (
      <WorkflowServices
        current={current}
        other={side === 'before' ? after : before}
        previous={previous}
        report={report}
        icons={icons}
        side={side}
        onEdit={onEdit}
      />
    )
  } else if (row) {
    content = (
      <>
        <Button ref={back} type="button" size="sm" variant="ghost" className="mb-2" onClick={onClear}>
          <Icon icon={ArrowLeft} size={14} /> All workflows
        </Button>
        <WorkflowDetail
          key={row.workflow.id}
          row={row}
          current={current}
          report={report}
          side={side}
          onEdit={onEdit}
          onGraph={onGraph}
        />
      </>
    )
  } else {
    content = (
      <WorkflowList
        current={current}
        previous={previous}
        tableRef={list}
        onSelect={(id) => onSelect({ id, side })}
      />
    )
  }

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
                aria-pressed={tab === choice} onClick={() => {
                  setTab(choice)
                  onClear()
                }}>
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
        {content}
      </div>
    </>
  )
}

function WorkflowList({ current, previous, tableRef, onSelect }: {
  current: WorkflowSide
  previous?: WorkflowSide
  tableRef: RefObject<HTMLTableElement | null>
  onSelect: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto" role="region" aria-label="Workflow costs" tabIndex={0}>
      <table ref={tableRef} className="w-full">
        <thead className="border-y text-xs text-muted-foreground">
          <tr>
            <th scope="col" className={leftCellClass}>Workflow</th>
            <th scope="col" className={rightCellClass}>Per run</th>
            <th scope="col" className={rightCellClass}>Per 1M</th>
            <th scope="col" className={rightCellClass}>Monthly</th>
          </tr>
        </thead>
        <tbody>
          {[...current.workflows.values()].map((entry) => <tr key={entry.workflow.id} className="cursor-pointer border-b hover:bg-white/5"
            onClick={() => onSelect(entry.workflow.id)}>
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
          {!current.workflows.size && <tr><td colSpan={4} className={leftCellClass}>No workflows found.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
