import { AnimatePresence, m } from 'motion/react'
import type { ComponentProps, ReactNode, RefObject } from 'react'
import { memo } from 'react'
import type { Topology } from '../../lib/graph.types'
import { contentVariants, useMotionTransition } from '../../lib/motion'
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
  }
  isEmpty: boolean
  noFlow: boolean
  layoutFailed: boolean
  legend: ComponentProps<typeof ConnectionLegend>
  canvas?: ComponentProps<typeof DiagramCanvas>
  toolbar: Omit<ComponentProps<typeof Toolbar>, 'setTopology' | 'onClearWorkflow' | 'costControl' | 'inert'>
  mapControls: ComponentProps<typeof MapControls>
  onTopologyChange: (side: Topology) => void
  onClearWorkflow?: () => void
  inspector: ReactNode
  inspectorModal: boolean
  costs?: ReactNode
  costControl?: ComponentProps<typeof Toolbar>['costControl']
  costMaximized: boolean
  changes: string
}

const stageStyles = {
  stage:
    'relative min-h-0 min-w-0 flex-1 cursor-grab touch-none overflow-hidden bg-background bg-[radial-gradient(var(--diagram-grid)_.8px,transparent_.8px)] bg-[length:20px_20px] data-[inspecting=true]:bg-[radial-gradient(var(--diagram-grid-inspecting)_.8px,transparent_.8px)] text-foreground',
  empty: 'pointer-events-none absolute inset-x-[12%] top-[42%] text-center text-muted-foreground',
  changes: 'pointer-events-none absolute top-3 left-3 rounded-sm border bg-card px-2 py-1 text-xs text-muted-foreground tabular-nums',
}

// The stage can update independently of the React Flow nodes and edges.
const MemoizedDiagramCanvas = memo(DiagramCanvas)

export function Diagram({
  stage, isEmpty, noFlow, layoutFailed, legend, canvas, toolbar, mapControls,
  onTopologyChange, onClearWorkflow, inspector, inspectorModal, costs, costControl, costMaximized, changes,
}: DiagramProps) {
  const transition = useMotionTransition('content')
  let emptyMessage = 'This file contains no resources.'
  if (onClearWorkflow) emptyMessage = 'No workflow resources in this snapshot.'
  else if (noFlow) emptyMessage = 'No configured connections'

  return (
    <Box className="report-workspace" data-cost-maximized={costMaximized}>
      <Toolbar {...toolbar} setTopology={onTopologyChange} onClearWorkflow={onClearWorkflow}
        costControl={costControl} inert={inspectorModal} />
      <Box className="report-diagram-row relative flex min-h-0 min-w-0 flex-1" inert={costMaximized}>
        <Box as="main" id="stage" aria-label="Interactive infrastructure diagram" className={stageStyles.stage} inert={inspectorModal} {...stage}>
          {canvas && <MemoizedDiagramCanvas {...canvas} />}
          {changes && <Text as="p" className={stageStyles.changes}>{changes} · all resources</Text>}
          <AnimatePresence initial={false}>
            {(layoutFailed || isEmpty || noFlow) && (
              <m.p key={layoutFailed ? 'layout-error' : emptyMessage}
                id={layoutFailed ? undefined : 'empty'} role={layoutFailed ? 'alert' : undefined}
                className={stageStyles.empty} variants={contentVariants} initial="initial"
                animate="visible" exit="exit" transition={transition}>
                {layoutFailed ? 'The diagram layout could not be calculated.' : emptyMessage}
              </m.p>
            )}
          </AnimatePresence>
        </Box>
        {inspector}
      </Box>
      {costs}
      <MapControls {...mapControls} inert={inspectorModal} disabled={costMaximized || mapControls.disabled}>
        {!isEmpty && <ConnectionLegend {...legend} />}
      </MapControls>
    </Box>
  )
}
