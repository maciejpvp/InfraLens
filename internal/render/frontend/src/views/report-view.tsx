import { useMemo, useState } from 'react'
import { Box } from '../ui/box'
import { Text } from '../ui/text'
import type { Graph, ServiceIcons, Topology } from '../lib/graph.types'

import { useViewer } from '../hooks/use-viewer'
import { reportViewStyles } from './report-view.variants'
import { ConnectionLegend } from '../components/connection-legend'
import { Diagram } from '../components/diagram'
import { DetailsDialog } from '../components/details-dialog'
import { MapControls } from '../components/map-controls'
import type { CostReport } from '../lib/costs'
import { CostWindow } from '../components/cost-window'
import type { CostTab } from '../components/cost-window'
import { workflowPath, workflowsForResource, workflowUsage } from '../lib/workflows'
import type { WorkflowEdits, WorkflowSelection } from '../lib/workflows'
import { Button } from '../ui/button'
import { Toolbar } from '../components/toolbar'

export const ReportView = ({ graph, icons, costs }: { graph: Graph; icons: ServiceIcons; costs?: CostReport }) => {
  const [costOpen, setCostOpen] = useState(false)
  const [costTab, setCostTab] = useState<CostTab>('services')
  const [workflow, setWorkflow] = useState<WorkflowSelection>()
  const [workflowEdits, setWorkflowEdits] = useState<WorkflowEdits>({})
  const selected = costs?.workflows?.items.find(({ id }) => id === workflow?.id)
  const path = useMemo(() => workflow ? workflowPath(graph, selected, workflow.side) : undefined, [graph, selected, workflow])
  const usage = useMemo(() => workflow ? workflowUsage(selected, workflow.side, workflowEdits) : undefined,
    [selected, workflow, workflowEdits])
  const {
    stageProps,
    isEmpty,
    noFlow,
    layoutFailed,
    legendProps,
    diagramProps,
    toolbarProps,
    mapControlsProps,
    detailsProps,
  } = useViewer(graph, icons, path, usage)

  const setTopology = (side: Topology) => {
    toolbarProps.setTopology(side)
    setWorkflow((selected) => selected ? { ...selected, side } : undefined)
  }
  const selectWorkflow = (next: WorkflowSelection) => {
    detailsProps.inspector.close()
    toolbarProps.setTopology(next.side)
    setWorkflow(next)
    setCostTab('workflows')
    setCostOpen(true)
  }
  const resourceWorkflows = (id: string) => {
    const workflows = workflowsForResource(costs?.workflows, id, toolbarProps.topology)
    if (!workflows.length) return null
    return (
      <section aria-label="Resource cost workflows" className="mb-3 space-y-1">
        <h3 className="font-medium">Cost workflows</h3>
        {workflows.map((entry) => (
          <Button key={entry.id} type="button" size="sm" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left"
            onClick={() => selectWorkflow({ id: entry.id, side: toolbarProps.topology })}>
            {entry.label}
          </Button>
        ))}
      </section>
    )
  }

  return (
    <>
      <Box
        as="main"
        id="stage"
        aria-label="Interactive infrastructure diagram"
        className={reportViewStyles.stage}
        {...stageProps}
      >
        {diagramProps && <Diagram {...diagramProps} />}
        <Toolbar {...toolbarProps} setTopology={setTopology} onClearWorkflow={path ? () => setWorkflow(undefined) : undefined} />
        {mapControlsProps && <MapControls {...mapControlsProps} />}
        {costs && <CostWindow
          report={costs} icons={icons} open={costOpen} setOpen={setCostOpen}
          tab={costTab} setTab={setCostTab} topology={toolbarProps.topology} selection={workflow}
          workflowEdits={workflowEdits} onEditWorkflow={(key, value) => setWorkflowEdits((edits) => ({ ...edits, [key]: value }))}
          onSelect={selectWorkflow} onSide={setTopology} onClear={() => setWorkflow(undefined)}
        />}
        {!isEmpty && <ConnectionLegend {...legendProps} />}
        {layoutFailed && (
          <Text as="p" role="alert" className={reportViewStyles.empty}>
            The diagram layout could not be calculated.
          </Text>
        )}
        <Text as="p" id="empty" hidden={!isEmpty && !noFlow} className={reportViewStyles.empty}>
          {path ? 'No workflow resources in this snapshot.' : noFlow ? 'No configured connections' : 'This file contains no resources.'}
        </Text>
      </Box>
      <DetailsDialog {...detailsProps} resourceWorkflows={costs?.workflows ? resourceWorkflows : undefined} />
    </>
  )
}
