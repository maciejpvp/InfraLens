import { useMemo, useState } from 'react'
import type { Graph } from '../../lib/graph.types'
import type { WorkflowEdits, Workflows, WorkflowSelection } from './workflows'
import { workflowPath, workflowUsage } from './workflows'

export const useWorkflowSelection = (graph: Graph, workflows?: Workflows) => {
  const [selection, setSelection] = useState<WorkflowSelection>()
  const [edits, setEdits] = useState<WorkflowEdits>({})
  const selected = workflows?.items.find(({ id }) => id === selection?.id)
  const path = useMemo(
    () => selection ? workflowPath(graph, selected, selection.side) : undefined,
    [graph, selected, selection],
  )
  const usage = useMemo(
    () => selection ? workflowUsage(selected, selection.side, edits) : undefined,
    [selected, selection, edits],
  )
  const edit = (key: string, value: string) => setEdits((current) => ({ ...current, [key]: value }))

  return { selection, setSelection, edits, edit, path, usage }
}
