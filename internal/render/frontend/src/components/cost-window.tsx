import { useMemo, useRef, useState } from 'react'
import { DollarSign, GripHorizontal, Info, X } from 'lucide-react'
import { Dialog as RadixDialog, Tooltip } from 'radix-ui'
import { calculateCosts } from '../lib/costs'
import type { CostReport, Costs, Estimate, Scenario } from '../lib/costs'
import { serviceFor } from '../lib/graph-projection'
import { serviceIconSrc } from '../lib/graph-view'
import type { ServiceIcons, Topology } from '../lib/graph.types'
import { cn } from '../lib/utils'
import { useFloatingWindow } from '../hooks/use-floating-window'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { DialogClose } from '../ui/dialog-close'
import { DialogTitle } from '../ui/dialog-title'
import { FloatingWindow } from '../ui/floating-window'
import { Icon } from '../ui/icon'
import { CatalogRates } from './catalog-rates'
import { CostStatusTooltip } from './cost-status-tooltip'
import { CostAssumptions } from './cost-assumptions'
import { WorkflowCosts } from './workflow-costs'
import type { WorkflowEdits, WorkflowSelection } from '../lib/workflows'
import { toolbarStyles } from './toolbar.variants'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const signedCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'exceptZero' })
const cell = 'px-2 py-2 text-right align-top tabular-nums'
const metrics = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'usage', label: 'Per 1M' },
] as const
const modes = ['Before', 'After', 'Compare'] as const
type Mode = typeof modes[number]

const amountText = (amount: number) => amount > 0 && amount < 0.01 ? '<$0.01' : currency.format(amount)

const CostValue = ({ value }: { value: Estimate }) => (
  <td className={cell}>
    <span className="inline-flex items-center whitespace-nowrap">
      {value.priced ? amountText(value.amount) : '—'}
      <CostStatusTooltip value={value} />
    </span>
  </td>
)

const Difference = ({ before, after }: { before: Estimate; after: Estimate }) => {
  const available = before.missing.length === 0 && after.missing.length === 0
  const raw = after.amount - before.amount
  const delta = Math.abs(raw) < 1e-9 ? 0 : raw
  const label = delta && Math.abs(delta) < 0.01
    ? (delta > 0 ? '<$0.01 more' : '<$0.01 less') : signedCurrency.format(delta)
  return (
    <td className={cn(cell, available && delta > 0 && 'text-orange-300', available && delta < 0 && 'text-emerald-300')}>
      {available ? label : <span aria-label="Difference unavailable">—</span>}
    </td>
  )
}

const CostCells = ({ mode, before, after }: { mode: Mode; before: Costs; after: Costs }) => (
  metrics.map(({ id }) => mode === 'Compare' ? (
    <CostComparisonCells key={id} before={before[id]} after={after[id]} />
  ) : <CostValue key={id} value={(mode === 'Before' ? before : after)[id]} />)
)

const CostComparisonCells = ({ before, after }: { before: Estimate; after: Estimate }) => (
  <><CostValue value={before} /><CostValue value={after} /><Difference before={before} after={after} /></>
)

const EstimateInfo = ({ report }: { report: CostReport }) => {
  const [open, setOpen] = useState(false)
  const note = report.workflows
    ? 'Public AWS rates in USD. Fixed uses a 730-hour month. Usage includes workflow traffic and shared usage such as storage. Free tier, discounts, and taxes can affect your bill.'
    : 'Public AWS rates in USD. Monthly uses 730 hours. Per 1M uses the quantities in Usage assumptions. Free tier, discounts, and taxes can affect your bill.'
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <Button
            type="button" size="icon-sm" variant="ghost" aria-label="About cost estimates"
            onClick={(event) => {
              event.preventDefault()
              setOpen(true)
            }}
          >
            <Icon icon={Info} size={16} />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-[60] max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-card p-3 text-xs text-foreground shadow-panel">
            {note} Price catalog lookup {report.date} UTC.
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export type CostTab = 'services' | 'workflows'

export const CostWindow = ({
  report, icons, open, setOpen, tab, setTab, topology, selection, onSelect, onSide, onClear, workflowEdits, onEditWorkflow,
}: {
  report: CostReport; icons: ServiceIcons
  open: boolean; setOpen: (open: boolean) => void
  tab: CostTab; setTab: (tab: CostTab) => void
  workflowEdits: WorkflowEdits; onEditWorkflow: (key: string, value: string) => void
  topology: Topology; selection?: WorkflowSelection
  onSelect: (selection: WorkflowSelection) => void; onSide: (side: Topology) => void; onClear: () => void
}) => {
  const [mode, setMode] = useState<Mode>(report.before ? 'Compare' : 'After')
  const [scenario, setScenario] = useState<Scenario>({})
  const bodyRef = useRef<HTMLDivElement>(null)
  const { windowRef, moveWithKeys, dragEvents } = useFloatingWindow(open)
  const legacy = useMemo(() => report.workflows ? undefined : calculateCosts(report, scenario), [report, scenario])
  const sorted = useMemo(() => (legacy?.rows ?? []).map((row) => ({
    ...row, display: serviceFor({ provider: 'aws', service: row.service }),
  })).sort((a, b) => a.display.name.localeCompare(b.display.name)), [legacy])

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <RadixDialog.Trigger asChild>
        <Button
          variant="ghost" size="sm"
          className={cn(toolbarStyles.panel, 'bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.75rem))] left-2.5 min-h-10 px-3.5 sm:left-4')}
        >
          <Icon icon={DollarSign} size={16} /> Costs
        </Button>
      </RadixDialog.Trigger>
      <FloatingWindow
        id="report-cost-window" ref={windowRef} aria-describedby={undefined}
        onInteractOutside={selection ? (event) => event.preventDefault() : undefined}
        className={cn('bottom-28 left-2.5 flex w-max max-w-[var(--inspector-max-width,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-2xl border bg-card text-sm shadow-panel sm:left-4',
          report.workflows ? 'max-h-[min(76dvh,var(--inspector-max-height,100dvh))]' : 'max-h-[var(--inspector-max-height,calc(100dvh-1.25rem))]')}
      >
        <header {...dragEvents} className="flex touch-none items-center gap-1 border-b px-3 py-2 select-none">
          <Button
            data-window-grip type="button" variant="ghost" size="icon-sm"
            className="cursor-grab active:cursor-grabbing"
            aria-label="Move costs window with arrow keys. Home resets position." onKeyDown={moveWithKeys}
          >
            <Icon icon={GripHorizontal} size={16} />
          </Button>
          <DialogTitle className="text-base">AWS cost estimate</DialogTitle>
          <EstimateInfo report={report} />
          <DialogClose asChild>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Close costs" className="ml-auto">
              <Icon icon={X} size={16} />
            </Button>
          </DialogClose>
        </header>
        <Tooltip.Provider delayDuration={200}>
        <div className={cn('min-h-0', report.workflows
          ? 'flex w-[37rem] max-w-full flex-col' : 'overflow-auto overscroll-contain px-3 py-3')}>
          {report.workflows ? (
            <WorkflowCosts report={report} icons={icons} edits={workflowEdits} onEdit={onEditWorkflow}
              tab={tab} setTab={setTab} side={topology} selection={selection} onSelect={onSelect}
              onSide={onSide} onClear={onClear} onGraph={() => setOpen(false)} bodyRef={bodyRef} />
          ) : (<>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              USD{report.regions?.length ? ' · ' + report.regions.join(', ') : ''}
              {report.fallback && ` · Fallback region ${report.fallback}`}
            </p>
            {report.before && (
              <div role="group" aria-label="Cost comparison" className={toolbarStyles.modes}>
                {modes.map((choice) => (
                  <Button
                    key={choice} type="button" size="sm" variant={mode === choice ? 'secondary' : 'ghost'}
                    aria-pressed={mode === choice} className={toolbarStyles.modeButton}
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
          <div role="region" className="overflow-x-auto" tabIndex={mode === 'Compare' ? 0 : undefined} aria-label="AWS cost table">
            <table className="w-full border-collapse text-sm">
              {mode === 'Compare' && <><colgroup span={1} /><colgroup span={3} /><colgroup span={3} /></>}
              <thead className="border-y text-xs text-muted-foreground">
                <tr>
                  <th rowSpan={mode === 'Compare' ? 2 : 1} scope="col" className="min-w-28 p-2 text-left">Service</th>
                  {metrics.map(({ id, label }) => (
                    <th key={id} scope={mode === 'Compare' ? 'colgroup' : 'col'} colSpan={mode === 'Compare' ? 3 : 1} className={cell}>{label}</th>
                  ))}
                </tr>
                {mode === 'Compare' && (
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
                  <tr><td colSpan={mode === 'Compare' ? 7 : 3} className="p-2 text-muted-foreground">No AWS resources found.</td></tr>
                )}
              </tbody>
              <tfoot className="font-semibold">
                <tr><th scope="row" className="p-2 text-left align-top">Total</th><CostCells mode={mode} {...legacy!.total} /></tr>
              </tfoot>
            </table>
          </div>
          {report.catalogs && <CatalogRates catalogs={report.catalogs} />}
          <CostAssumptions
            report={report} scenario={scenario} setScenario={setScenario}
            side={mode === 'Compare' ? undefined : mode === 'Before' ? 'before' : 'after'}
          />
          </>)}
        </div>
        </Tooltip.Provider>
      </FloatingWindow>
    </Dialog>
  )
}
