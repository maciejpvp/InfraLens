import { AnimatePresence, m, useIsPresent } from 'motion/react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { DetailSection, DetailSections } from '../../components/detail-sections'
import { MotionContent } from '../../components/motion-content'
import { SegmentButton } from '../../components/segment-button'
import { disclosureVariants, useMotionTransition } from '../../lib/motion'
import { segmentedControlClass } from '../../components/overlay-styles'
import { cn } from '../../lib/utils'
import { serviceFor } from '../../lib/graph-projection'
import { serviceIconSrc } from '../../lib/graph-view'
import type { ServiceIcons, Topology } from '../../lib/graph.types'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { Input } from '../../ui/input'
import type { CostReport, Estimate } from './costs'
import { CatalogRates } from './estimate-details'
import { type WorkflowSelection, type WorkflowSide, maxWorkflowInput, workflowUserPresets } from './workflows'

import { WorkflowDetail } from './workflow-detail'
import { EstimateCell, FeeDetails, Issues, Sources, leftCellClass, rightCellClass } from './workflow-estimate'
import { filterCostEntries, workflowEstimate } from './workflow-table'
import type { WorkflowBasis, WorkflowRow } from './workflow-table'
import { WorkflowBasisSelect, WorkflowTableControls } from './workflow-table-controls'
import type { WorkflowTableFilter } from './workflow-table-controls'

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
                <tr key={service} className="border-b transition-colors duration-(--motion-hover) ease-(--motion-standard) hover:bg-accent/50">
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
  report, icons, after, before, onEdit, tab, setTab, selection, side, onSide, onSelect, onClear, onGraph, bodyRef,
  basis, setBasis, colorByCost, setColorByCost,
  listFilter, setListFilter, listBasis, setListBasis,
}: {
  report: CostReport
  icons: ServiceIcons
  after: WorkflowSide
  before?: WorkflowSide
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
  basis: WorkflowBasis
  setBasis: (basis: WorkflowBasis) => void
  colorByCost: boolean
  setColorByCost: (checked: boolean) => void
  listFilter: WorkflowTableFilter
  setListFilter: (filter: WorkflowTableFilter) => void
  listBasis: WorkflowBasis
  setListBasis: (basis: WorkflowBasis) => void
}) {
  const filterTransition = useMotionTransition('disclosure')
  const current = side === 'before' && before ? before : after
  const previous = side === 'after' ? before : undefined
  const row = tab === 'workflows' && selection ? current.workflows.get(selection.id) : undefined
  const selectedButton = useRef<HTMLButtonElement>(null)
  const active = row?.workflow.id
  useLayoutEffect(() => {
    const button = selectedButton.current
    if (active && button && !bodyRef.current?.contains(document.activeElement)) {
      button.scrollIntoView({ block: 'nearest' })
    }
  }, [active, bodyRef])

  const detail = row && <WorkflowDetail
    key={row.workflow.id}
    row={row}
    current={current}
    report={report}
    side={side}
    onEdit={onEdit}
    onGraph={onGraph}
    basis={basis}
    setBasis={setBasis}
    colorByCost={colorByCost}
    setColorByCost={setColorByCost}
  />

  const clear = () => {
    selectedButton.current?.focus({ preventScroll: true })
    onClear()
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-card px-3 py-1.5">
        <div className={segmentedControlClass} role="group" aria-label="Cost view">
          {(['services', 'workflows'] as const).map((choice) => (
            <SegmentButton key={choice} type="button" size="sm" group="cost-view" pressed={tab === choice} onClick={() => setTab(choice)}>
              {choice === 'services' ? 'Services' : 'Workflows'}
            </SegmentButton>
          ))}
        </div>
        {before && <div className={segmentedControlClass} role="group" aria-label="Cost snapshot">
          {(['before', 'after'] as const).map((state) => (
            <SegmentButton key={state} type="button" size="sm" group="cost-snapshot" pressed={side === state} onClick={() => onSide(state)}>
              {state === 'before' ? 'Before' : 'After'}
            </SegmentButton>
          ))}
        </div>}
        <div className="ml-auto flex max-w-full flex-wrap items-center gap-1">
          <label className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Monthly active users
            <Input type="number" className="h-7 w-24 text-sm tabular-nums" min={0} max={maxWorkflowInput} step="any"
              value={current.users ?? ''} placeholder="Unknown" onChange={(event) => onEdit('users', event.currentTarget.value)} />
          </label>
          <div className="flex gap-1" role="group" aria-label="Active user presets">
            {workflowUserPresets.map(({ value, label }) => (
              <SegmentButton key={value} type="button" size="sm" group="cost-users" variant="outline"
                pressed={current.users === value} onClick={() => onEdit('users', String(value))}>{label}</SegmentButton>
            ))}
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {tab === 'workflows' && (
          <m.div className="shrink-0 overflow-hidden" initial="closed" animate="open" exit="closed"
            variants={disclosureVariants} transition={filterTransition}>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b px-3 py-1.5">
              <WorkflowTableControls list filter={listFilter} onChange={setListFilter}>
                <WorkflowBasisSelect label="Workflow cost basis" value={listBasis} onChange={setListBasis} />
              </WorkflowTableControls>
              {selection && <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-primary"
                onClick={clear}><Icon icon={X} size={14} /> Clear workflow</Button>}
            </div>
          </m.div>
        )}
      </AnimatePresence>
      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-2" tabIndex={0} aria-label="Cost estimates">
        <AnimatePresence initial={false} mode="popLayout">
          <MotionContent key={tab}>
            {tab === 'services' ? (
              <WorkflowServices current={current} other={side === 'before' ? after : before} previous={previous}
                report={report} icons={icons} side={side} onEdit={onEdit} />
            ) : (
              <WorkflowList current={current} previous={previous} filter={listFilter} basis={listBasis}
                selected={row} selectedButton={selectedButton} detail={detail}
                onSelect={(id) => id === active ? clear() : onSelect({ id, side })} />
            )}
          </MotionContent>
        </AnimatePresence>
      </div>
    </>
  )
}

function WorkflowList({ current, previous, onSelect, filter, basis, selected, selectedButton, detail }: {
  current: WorkflowSide
  previous?: WorkflowSide
  onSelect: (id: string) => void
  filter: WorkflowTableFilter
  basis: WorkflowBasis
  selected?: WorkflowRow
  selectedButton: RefObject<HTMLButtonElement | null>
  detail?: ReactNode
}) {
  const rows = filterCostEntries([...current.workflows.values()].map((entry) => ({
    entry, labels: [entry.workflow.label], estimate: workflowEstimate(entry, basis), absent: !entry.state,
  })), filter.query, filter.pricing, filter.order).map(({ entry }) => entry)
  if (selected && !rows.includes(selected)) rows.unshift(selected)

  return (
    <table className="w-full min-w-[26rem]" aria-label="Workflow costs">
      <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
        <tr>
          <th scope="col" className={leftCellClass}>Workflow</th>
          <th scope="col" className={rightCellClass}>Per run</th>
          <th scope="col" className={rightCellClass}>Per 1M</th>
          <th scope="col" className={rightCellClass}>Monthly</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry) => {
          const id = entry.workflow.id
          const expanded = entry === selected
          return (
            <Fragment key={id}>
              <tr className={cn('cursor-pointer border-b transition-colors duration-(--motion-hover) ease-(--motion-standard) hover:bg-accent/50', expanded && 'bg-muted')}
                onClick={(event) => {
                  if (event.target instanceof Element && !event.target.closest('button')) onSelect(id)
                }}>
                <th scope="row" className="p-0 text-left">
                  <Button ref={expanded ? selectedButton : undefined} data-workflow={id} type="button" variant="ghost" size="sm"
                    aria-expanded={expanded} aria-controls={expanded ? `workflow-detail-${id}` : undefined} onClick={() => onSelect(id)}
                    className={cn('h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1 text-left wrap-anywhere', expanded && 'text-primary')}>
                    <Icon icon={expanded ? ChevronDown : ChevronRight} size={14} />
                    {entry.workflow.label}
                  </Button>
                </th>
                <EstimateCell value={entry.state ? entry.one.total : { ...zero, priced: false }} precise />
                <EstimateCell value={entry.state ? entry.million.total : { ...zero, priced: false }} />
                <EstimateCell value={entry.month} before={previous?.workflows.get(id)?.month} />
              </tr>
              <AnimatePresence initial={false}>
                {expanded && <WorkflowDetailRow id={id}>{detail}</WorkflowDetailRow>}
              </AnimatePresence>
            </Fragment>
          )
        })}
        {!rows.length && <tr><td colSpan={4} className={leftCellClass}>No workflows found.</td></tr>}
      </tbody>
    </table>
  )
}

function WorkflowDetailRow({ id, children }: { id: string; children: ReactNode }) {
  const present = useIsPresent()
  const transition = useMotionTransition('disclosure')

  return (
    <m.tr data-workflow-detail={id} id={`workflow-detail-${id}`} inert={!present} initial="closed" animate="open" exit="closed">
      <td colSpan={4} className="bg-background/40 p-0">
        <m.div className="overflow-hidden" variants={disclosureVariants} transition={transition}>
          <div className="border-b p-3">{children}</div>
        </m.div>
      </td>
    </m.tr>
  )
}
