import type { EdgeMarker } from '@xyflow/react'

import { MarkerType } from '@xyflow/react'
import { DiagramEdge } from './diagram-edge'
import { DiagramItem } from './diagram-item'

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
