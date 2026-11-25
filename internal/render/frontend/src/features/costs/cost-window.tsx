import { DollarSign, GripHorizontal, Info, X } from 'lucide-react'
import { Dialog as RadixDialog, Tooltip } from 'radix-ui'
import { useRef, useState } from 'react'
import { FloatingWindow } from '../../components/floating-window'
import { overlayPanelClass } from '../../components/overlay-styles'
import { useFloatingWindow } from '../../hooks/use-floating-window'
import type { ServiceIcons, Topology } from '../../lib/graph.types'
import { cn } from '../../lib/utils'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { DialogClose } from '../../ui/dialog-close'
import { DialogTitle } from '../../ui/dialog-title'
import { Icon } from '../../ui/icon'
import type { CostReport, Scenario } from './costs'
import type { CostComparisonMode } from './resource-costs'
import { ResourceCosts } from './resource-costs'
import { WorkflowCosts } from './workflow-costs'
import type { CostTab } from './workflow-costs'
import type { WorkflowSelection, WorkflowSide } from './workflows'
import type { WorkflowBasis } from './workflow-table'
import { defaultWorkflowTableFilter } from './workflow-table-controls'

function EstimateInfo({ report }: { report: CostReport }) {
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

export function CostWindow({
  report, icons, open, setOpen, tab, setTab, topology, selection, onSelect, onSide, onClear, pricing, onEditWorkflow,
  workflowBasis, setWorkflowBasis, colorByCost, setColorByCost,
}: {
  report: CostReport
  icons: ServiceIcons
  open: boolean
  setOpen: (open: boolean) => void
  tab: CostTab
  setTab: (tab: CostTab) => void
  pricing?: { after: WorkflowSide; before?: WorkflowSide }
  onEditWorkflow: (key: string, value: string) => void
  workflowBasis: WorkflowBasis
  setWorkflowBasis: (basis: WorkflowBasis) => void
  colorByCost: boolean
  setColorByCost: (checked: boolean) => void
  topology: Topology
  selection?: WorkflowSelection
  onSelect: (selection: WorkflowSelection) => void
  onSide: (side: Topology) => void
  onClear: () => void
}) {
  const [mode, setMode] = useState<CostComparisonMode>(report.before ? 'Compare' : 'After')
  const [scenario, setScenario] = useState<Scenario>({})
  const [listFilter, setListFilter] = useState(defaultWorkflowTableFilter)
  const [listBasis, setListBasis] = useState<WorkflowBasis>('month')
  const bodyRef = useRef<HTMLDivElement>(null)
  const { windowRef, moveWithKeys, dragEvents } = useFloatingWindow(open)

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <RadixDialog.Trigger asChild>
        <Button
          variant="ghost" size="sm"
          className={cn(overlayPanelClass, 'bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.75rem))] left-2.5 min-h-10 px-3.5 sm:left-4')}
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
              pricing && <WorkflowCosts report={report} icons={icons} {...pricing} onEdit={onEditWorkflow}
                tab={tab} setTab={setTab} side={topology} selection={selection} onSelect={onSelect}
                basis={workflowBasis} setBasis={setWorkflowBasis} colorByCost={colorByCost} setColorByCost={setColorByCost}
                listFilter={listFilter} setListFilter={setListFilter} listBasis={listBasis} setListBasis={setListBasis}
                onSide={onSide} onClear={onClear} onGraph={() => setOpen(false)} bodyRef={bodyRef} />
            ) : (
              <ResourceCosts report={report} icons={icons} mode={mode} setMode={setMode} scenario={scenario} setScenario={setScenario} />
            )}
          </div>
        </Tooltip.Provider>
      </FloatingWindow>
    </Dialog>
  )
}
