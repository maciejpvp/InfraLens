import { AnimatePresence } from 'motion/react'
import { Info, Maximize, Minimize, X } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { useRef, useState } from 'react'
import { Dock } from '../../components/dock'
import { ResizeHandle } from '../../components/resize-handle'
import type { ServiceIcons, Topology } from '../../lib/graph.types'
import { Button } from '../../ui/button'
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
          <Tooltip.Content data-motion-tooltip sideOffset={6} className="z-[60] max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-card p-3 text-xs text-foreground shadow-panel">
            {note} Price catalog lookup {report.date} UTC.
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export function CostWindow({
  report, icons, open, maximized, inert, onMaximize, onClose, tab, setTab, topology, selection, onSelect, onSide, onClear, pricing, onEditWorkflow,
  workflowBasis, setWorkflowBasis, colorByCost, setColorByCost,
}: {
  report: CostReport
  icons: ServiceIcons
  open: boolean
  maximized: boolean
  inert: boolean
  onMaximize: () => void
  onClose: () => void
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
  const totals = (topology === 'before' ? pricing?.before : pricing?.after)?.totals

  return (
    <AnimatePresence>
      {open && <Dock kind="cost" maximized={maximized}>
        {(_, resizable) => (
          <section id="report-cost-window" aria-labelledby="cost-title" inert={inert} data-resizable={resizable} className="report-cost-dock relative flex min-w-0 shrink-0 flex-col border-t bg-card text-sm"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                onClose()
              }
            }}>
            {resizable && <ResizeHandle panelId="report-cost-window" axis="height" label="Resize costs" />}
            <header className="flex min-h-9 shrink-0 items-center gap-1 border-b px-3">
              <h2 id="cost-title" className="font-semibold">AWS cost estimate</h2>
              <EstimateInfo report={report} />
              {totals?.monthly.missing.length ? <span className="text-xs text-muted-foreground">Partial monthly estimate</span> : null}
              <Button type="button" size="icon-xs" variant="ghost" className="ml-auto"
                aria-label={maximized ? 'Restore costs' : 'Maximize costs'} title={maximized ? 'Restore costs' : 'Maximize costs'} onClick={onMaximize}>
                <Icon icon={maximized ? Minimize : Maximize} size={15} />
              </Button>
              <Button type="button" size="icon-xs" variant="ghost" aria-label="Close costs" title="Close costs" onClick={onClose}>
                <Icon icon={X} />
              </Button>
            </header>
            <Tooltip.Provider delayDuration={200}>
              {report.workflows ? (
                pricing && <WorkflowCosts report={report} icons={icons} {...pricing} onEdit={onEditWorkflow}
                  tab={tab} setTab={setTab} side={topology} selection={selection} onSelect={onSelect}
                  basis={workflowBasis} setBasis={setWorkflowBasis} colorByCost={colorByCost} setColorByCost={setColorByCost}
                  listFilter={listFilter} setListFilter={setListFilter} listBasis={listBasis} setListBasis={setListBasis}
                  onSide={onSide} onClear={onClear} onGraph={maximized ? onMaximize : onClose} bodyRef={bodyRef} />
              ) : (
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-2" tabIndex={0} aria-label="Cost estimates">
                  <ResourceCosts report={report} icons={icons} mode={mode} setMode={setMode} scenario={scenario} setScenario={setScenario} />
                </div>
              )}
            </Tooltip.Provider>
          </section>
        )}
      </Dock>}
    </AnimatePresence>
  )
}
