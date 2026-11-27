import { CostWindow } from '../features/costs/cost-window'
import type { CostReport } from '../features/costs/costs'
import { Diagram } from '../features/diagram/diagram'
import { DetailsDialog } from '../features/inspector/details-dialog'
import { useTheme } from '../hooks/use-theme'
import type { Graph, ServiceIcons } from '../lib/graph.types'
import { useReport } from './use-report'

export function App({ graph, icons, costs }: { graph: Graph; icons: ServiceIcons; costs?: CostReport }) {
  const themeControls = useTheme()
  const { diagramProps, detailsProps, costWindowProps } = useReport(graph, icons, costs)

  return (
    <>
      <Diagram {...diagramProps} toolbar={{ ...diagramProps.toolbar, ...themeControls }}>
        {costWindowProps && <CostWindow {...costWindowProps} />}
      </Diagram>
      <DetailsDialog {...detailsProps} />
    </>
  )
}
