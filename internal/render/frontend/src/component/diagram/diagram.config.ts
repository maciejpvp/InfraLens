import type { EdgeMarker, ReactFlowProps } from '@xyflow/react'
import type { ProjectedEdge } from '../../lib/graph.types'

import { MarkerType } from '@xyflow/react'
import { DiagramEdge } from './diagram-edge'
import { DiagramItem } from './diagram-item'

export const edgeAppearance: Record<ProjectedEdge['kind'], { color: string; width: number; dash?: string }> =
  {
    triggers: { color: '#51cfc1', width: 1.8 },
    connects_to: { color: '#ad98e6', width: 1.8, dash: '5 5' },
    depends_on: { color: '#7f91a8', width: 1.1, dash: '4 6' },
  }

export const edgeMarker: EdgeMarker = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  markerUnits: 'userSpaceOnUse',
  orient: 'auto',
}

export const edgeInteractionWidth = 18
export const diagramLayers = { group: 0, edge: 1, node: 2 }

export const diagramNodeTypes = { resource: DiagramItem }
export const diagramEdgeTypes = { relation: DiagramEdge }

export const diagramOptions = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  edgesReconnectable: false,
  elementsSelectable: false,
  autoPanOnNodeFocus: false,
  deleteKeyCode: null,
  selectionKeyCode: null,
  zoomOnDoubleClick: false,
  zIndexMode: 'manual',
  proOptions: { hideAttribution: true },
} satisfies ReactFlowProps
