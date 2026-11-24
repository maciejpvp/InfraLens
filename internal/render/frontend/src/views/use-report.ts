import { useState } from 'react'
import type { CostTab } from '../features/costs/workflow-costs'
import type { CostReport } from '../features/costs/costs'
import { useWorkflowSelection } from '../features/costs/use-workflow-selection'
import type { WorkflowSelection } from '../features/costs/workflows'
import { workflowsForResource } from '../features/costs/workflows'
import type { Graph, ServiceIcons, Topology } from '../lib/graph.types'
import { useViewer } from './use-viewer'

export const useReport = (graph: Graph, icons: ServiceIcons, costs?: CostReport) => {
  const [costOpen, setCostOpen] = useState(false)
  const [costTab, setCostTab] = useState<CostTab>('services')
  const { selection, setSelection, edits, edit, path, usage } = useWorkflowSelection(graph, costs?.workflows)
  const { diagramProps, detailsProps, setTopology: setDiagramTopology } = useViewer(graph, icons, path, usage)
  const { topology } = diagramProps.toolbar

  const setTopology = (side: Topology) => {
    setDiagramTopology(side)
    setSelection((current) => current ? { ...current, side } : undefined)
  }
  const selectWorkflow = (next: WorkflowSelection) => {
    detailsProps.inspector.close()
    setDiagramTopology(next.side)
    setSelection(next)
    setCostTab('workflows')
    setCostOpen(true)
  }
  const clearWorkflow = () => setSelection(undefined)

  return {
    diagramProps: {
      ...diagramProps,
      onTopologyChange: setTopology,
      onClearWorkflow: path ? clearWorkflow : undefined,
    },
    detailsProps: {
      ...detailsProps,
      resourceWorkflows: costs?.workflows && {
        forResource: (id: string) => workflowsForResource(costs.workflows, id, topology),
        onSelect: (id: string) => selectWorkflow({ id, side: topology }),
      },
    },
    costWindowProps: costs && {
      report: costs,
      icons,
      open: costOpen,
      setOpen: setCostOpen,
      tab: costTab,
      setTab: setCostTab,
      topology,
      selection,
      workflowEdits: edits,
      onEditWorkflow: edit,
      onSelect: selectWorkflow,
      onSide: setTopology,
      onClear: clearWorkflow,
    },
  }
}
