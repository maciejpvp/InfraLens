import type { Graph, ServiceIcons } from '../lib/graph.types'

import { useViewer } from '../hooks/use-viewer'
import { appStyles } from './app.variants'
import { Diagram } from './diagram/diagram'
import { DetailsDialog } from './inspector/details-dialog'
import { MapControls } from './toolbar/map-controls'
import { Toolbar } from './toolbar/toolbar'

export const App = ({ graph, icons }: { graph: Graph; icons: ServiceIcons }) => {
  const { stageProps, isEmpty, layoutFailed, diagramProps, toolbarProps, mapControlsProps, detailsProps } =
    useViewer(graph, icons)

  return (
    <>
      <main
        id="stage"
        aria-label="Interactive infrastructure diagram"
        className={appStyles.stage}
        {...stageProps}
      >
        {diagramProps && <Diagram {...diagramProps} />}
        <Toolbar {...toolbarProps} />
        {mapControlsProps && <MapControls {...mapControlsProps} />}
        {layoutFailed && (
          <p role="alert" className={appStyles.empty}>
            The diagram layout could not be calculated.
          </p>
        )}
        <p id="empty" hidden={!isEmpty} className={appStyles.empty}>
          This file contains no resources.
        </p>
      </main>
      <DetailsDialog {...detailsProps} />
    </>
  )
}
