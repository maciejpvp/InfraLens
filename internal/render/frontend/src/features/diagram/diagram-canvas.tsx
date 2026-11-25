import type { EdgeProps, ReactFlowProps } from '@xyflow/react'
import { ReactFlow, useViewportStore } from '@xyflow/react'
import { cn } from '../../lib/utils'
import { Text } from '../../ui/text'
import type { DiagramElementsOptions, DiagramNode, DiagramRelation } from './diagram-elements'
import { buildDiagramElements } from './diagram-elements'
import { FlowPath } from './flow-path'
import { roundedRoute } from './layout/layout-model.ts'
import { routeLayers, routeVisibility } from './layout/route-visibility'
import { DiagramItem } from './resource-card'
import { cameraConfig } from './use-camera'

const readOnlyFlowOptions = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  edgesReconnectable: false,
  elementsSelectable: false,
  autoPanOnNodeFocus: false,
  deleteKeyCode: null,
  selectionKeyCode: null,
  zoomOnDoubleClick: false,
  // React Flow adds its no-pan class to edges. Restrict the selector to our controls.
  noPanClassName: 'nopan:is(button)',
  paneDragThreshold: 4,
  zIndexMode: 'manual',
  proOptions: { hideAttribution: true },
} satisfies ReactFlowProps

type DiagramCanvasProps = DiagramElementsOptions & {
  init: ReactFlowProps<DiagramNode, DiagramRelation>['onInit']
  showZoom: ReactFlowProps<DiagramNode, DiagramRelation>['onMove']
}

export function DiagramCanvas(props: DiagramCanvasProps) {
  const { nodes, edges, onEdgeClick, dense } = buildDiagramElements(props)

  return (
    <ReactFlow<DiagramNode, DiagramRelation>
      id="diagram"
      aria-label="Stacks, components and connections"
      className={cn('size-full bg-transparent select-none', dense && 'dense-diagram')}
      nodes={nodes}
      edges={edges}
      nodeTypes={diagramNodeTypes}
      edgeTypes={diagramEdgeTypes}
      onInit={props.init}
      onMove={props.showZoom}
      onEdgeClick={onEdgeClick}
      minZoom={cameraConfig.minZoom}
      maxZoom={cameraConfig.maxZoom}
      {...readOnlyFlowOptions}
    />
  )
}

function DiagramEdge({ id, data, style, markerEnd, interactionWidth }: EdgeProps<DiagramRelation>) {
  const visible = useViewportStore(({ transform, width, height }) =>
    data && (data.underlay || data.stream || data.route.label)
      ? routeVisibility(data.route, transform, width, height, data.dense, data.highlighted)
      : 0,
  )
  if (!data) return null
  const { route } = data
  return (
    <g opacity={data.opacity} pointerEvents={data.retiring ? 'none' : undefined}>
      <FlowPath
        id={id}
        path={roundedRoute(route)}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={style}
        className={data.wireClassName}
        underlay={visible & routeLayers.paint ? data.underlay : undefined}
        stream={visible & routeLayers.paint ? data.stream : undefined}
        overlay={
          Boolean(visible & routeLayers.label) && route.label && (
            <Text className={data.labelClassName} data-edge-label={data.index} style={{ ...route.label.style, opacity: data.opacity }}>
              {route.label.text}
            </Text>
          )
        }
      />
    </g>
  )
}

const diagramNodeTypes = { resource: DiagramItem }
const diagramEdgeTypes = { relation: DiagramEdge }
