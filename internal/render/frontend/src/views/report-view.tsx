import { Box } from '../ui/box'
import { Text } from '../ui/text'
import type { Graph, ServiceIcons } from '../lib/graph.types'

import { useViewer } from '../hooks/use-viewer'
import { reportViewStyles } from './report-view.variants'
import { ConnectionLegend } from '../components/connection-legend'
import { Diagram } from '../components/diagram'
import { DetailsDialog } from '../components/details-dialog'
import { MapControls } from '../components/map-controls'
import { Toolbar } from '../components/toolbar'

export const ReportView = ({ graph, icons }: { graph: Graph; icons: ServiceIcons }) => {
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
  } = useViewer(graph, icons)

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
        <Toolbar {...toolbarProps} />
        {mapControlsProps && <MapControls {...mapControlsProps} />}
        {!isEmpty && <ConnectionLegend {...legendProps} />}
        {layoutFailed && (
          <Text as="p" role="alert" className={reportViewStyles.empty}>
            The diagram layout could not be calculated.
          </Text>
        )}
        <Text as="p" id="empty" hidden={!isEmpty && !noFlow} className={reportViewStyles.empty}>
          {noFlow ? 'No configured connections' : 'This file contains no resources.'}
        </Text>
      </Box>
      <DetailsDialog {...detailsProps} />
    </>
  )
}
