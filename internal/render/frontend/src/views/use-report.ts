import { useMemo, useState } from 'react'
import type { CostTab } from '../features/costs/workflow-costs'
import type { CostReport } from '../features/costs/costs'
import { useWorkflowSelection } from '../features/costs/use-workflow-selection'
import type { WorkflowSelection } from '../features/costs/workflows'
import { buildWorkflowSide, workflowsForResource } from '../features/costs/workflows'
import { workflowCostShares } from '../features/costs/workflow-table'
import type { WorkflowBasis } from '../features/costs/workflow-table'
import type { Graph, ServiceIcons, Topology } from '../lib/graph.types'
import { useViewer } from './use-viewer'

export const useReport = (graph: Graph, icons: ServiceIcons, costs?: CostReport) => {
  const [costOpen, setCostOpen] = useState(false)
  const [costTab, setCostTab] = useState<CostTab>('services')
  const [colorByCost, setColorByCost] = useState(false)
  const [workflowBasis, setWorkflowBasis] = useState<WorkflowBasis>('one')
  const { selection, setSelection, edits, edit, path, usage } = useWorkflowSelection(graph, costs?.workflows)
  const needsWorkflowPricing = costOpen || Boolean(colorByCost && selection)
  const pricing = useMemo(() => costs?.workflows && needsWorkflowPricing ? {
    after: buildWorkflowSide(costs, 'after', edits),
    before: costs.before && buildWorkflowSide(costs, 'before', edits),
  } : undefined, [costs, needsWorkflowPricing, edits])
  const workflowHeat = useMemo(() => {
    if (!colorByCost || !path || !selection || !pricing) return
    const current = pricing[selection.side] ?? pricing.after
    const row = current.workflows.get(selection.id)
    if (row) return workflowCostShares(row, current, workflowBasis, path.nodes)
  }, [colorByCost, path, pricing, selection, workflowBasis])
  const { diagramProps, detailsProps, setTopology: setDiagramTopology, exitDetailsView } = useViewer(graph, icons, path, usage, workflowHeat)
  const { topology } = diagramProps.toolbar

  const setTopology = (side: Topology) => {
    setDiagramTopology(side)
    setSelection((current) => current ? { ...current, side } : undefined)
  }
  const selectWorkflow = (next: WorkflowSelection) => {
    if (next.id !== selection?.id) setWorkflowBasis('one')
    exitDetailsView(!window.matchMedia('(max-width: 639px)').matches)
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
      pricing,
      workflowBasis,
      setWorkflowBasis,
      colorByCost,
      setColorByCost,
      onEditWorkflow: edit,
      onSelect: selectWorkflow,
      onSide: setTopology,
      onClear: clearWorkflow,
    },
  }
}
