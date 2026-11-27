import type { ComponentProps, ReactNode, RefObject } from 'react'
import { memo } from 'react'
import type { Topology } from '../../lib/graph.types'
import { Box } from '../../ui/box'
import { Text } from '../../ui/text'
import { ConnectionLegend } from './connection-legend'
import { DiagramCanvas } from './diagram-canvas'
import { MapControls } from './map-controls'
import { Toolbar } from './toolbar'

type DiagramProps = {
  stage: {
    ref: RefObject<HTMLElement | null>
    'aria-busy': boolean
    'data-inspecting': boolean
    'data-pipe-motion': string
  }
  isEmpty: boolean
  noFlow: boolean
  layoutFailed: boolean
  legend: ComponentProps<typeof ConnectionLegend>
  canvas?: ComponentProps<typeof DiagramCanvas>
  toolbar: Omit<ComponentProps<typeof Toolbar>, 'setTopology' | 'onClearWorkflow'>
  mapControls?: ComponentProps<typeof MapControls>
  onTopologyChange: (side: Topology) => void
  onClearWorkflow?: () => void
  children?: ReactNode
}

const stageStyles = {
  stage:
    'fixed inset-0 h-dvh w-full cursor-grab touch-none overflow-hidden bg-background bg-[radial-gradient(var(--diagram-grid)_.8px,transparent_.8px)] bg-[length:22px_22px] data-[inspecting=true]:bg-[radial-gradient(var(--diagram-grid-inspecting)_.8px,transparent_.8px)] text-foreground',
  empty: 'pointer-events-none absolute inset-x-[12%] top-[42%] text-center text-muted-foreground',
}

// The stage can update independently of the React Flow nodes and edges.
const MemoizedDiagramCanvas = memo(DiagramCanvas)

export function Diagram({
  stage, isEmpty, noFlow, layoutFailed, legend, canvas, toolbar, mapControls,
  onTopologyChange, onClearWorkflow, children,
}: DiagramProps) {
  let emptyMessage = 'This file contains no resources.'
  if (onClearWorkflow) emptyMessage = 'No workflow resources in this snapshot.'
  else if (noFlow) emptyMessage = 'No configured connections'

  return (
    <Box as="main" id="stage" aria-label="Interactive infrastructure diagram" className={stageStyles.stage} {...stage}>
      {canvas && <MemoizedDiagramCanvas {...canvas} />}
      <Toolbar {...toolbar} setTopology={onTopologyChange} onClearWorkflow={onClearWorkflow} />
      {mapControls && <MapControls {...mapControls} />}
      {children}
      {!isEmpty && <ConnectionLegend {...legend} />}
      {layoutFailed && (
        <Text as="p" role="alert" className={stageStyles.empty}>
          The diagram layout could not be calculated.
        </Text>
      )}
      <Text as="p" id="empty" hidden={!isEmpty && !noFlow} className={stageStyles.empty}>
        {emptyMessage}
      </Text>
    </Box>
  )
}
