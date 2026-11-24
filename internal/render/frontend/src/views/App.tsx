import { CostWindow } from '../features/costs/cost-window'
import type { CostReport } from '../features/costs/costs'
import { Diagram } from '../features/diagram/diagram'
import { DetailsDialog } from '../features/inspector/details-dialog'
import type { Graph, ServiceIcons } from '../lib/graph.types'
import { useReport } from './use-report'

export function App({ graph, icons, costs }: { graph: Graph; icons: ServiceIcons; costs?: CostReport }) {
  const { diagramProps, detailsProps, costWindowProps } = useReport(graph, icons, costs)

  return (
    <>
      <Diagram {...diagramProps}>
        {costWindowProps && <CostWindow {...costWindowProps} />}
      </Diagram>
      <DetailsDialog {...detailsProps} />
    </>
  )
}
