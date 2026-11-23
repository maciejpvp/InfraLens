import type { CSSProperties } from 'react'
import type { MoveCard } from '../hooks/use-scene-motion'
import type { FlowPaintLayer } from '../ui/flow-path'
import type { Edge, Node } from '@xyflow/react'
import type {
  GraphEdge,
  ProjectedItem,
  ResourcesById,
  Route,
  Scene,
  ServiceIcons,
  Size,
} from '../lib/graph.types'
import type { InspectorOrigin, InspectorPage } from '../lib/inspector.types'
import type { useCamera } from '../hooks/use-camera'

export type DiagramItemData = {
  item: ProjectedItem
  depth: number
  bounds: Size
  byId: ResourcesById
  icons: ServiceIcons
  selected: boolean
  muted: boolean
  visual?: CSSProperties
  retiring: boolean
  drag?: { moveCard: MoveCard; camera: DiagramProps['camera'] }
  onItem: (id: string) => void
  toggle: (id: string) => void
}

export type DiagramNode = Node<DiagramItemData, 'resource'>

type RelationData = {
  index: number
  route: Route
  wireClassName: string
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
  labelClassName: string
  opacity?: number
  retiring: boolean
}

export type DiagramRelation = Edge<RelationData, 'relation'> & { data: RelationData }

export type DiagramProps = {
  camera: ReturnType<typeof useCamera>
  scene: Scene
  moveCard: MoveCard
  byId: ResourcesById
  icons: ServiceIcons
  selection?: InspectorPage
  onItem: (id: string) => void
  onEdges: (edges: GraphEdge[], origin: InspectorOrigin) => void
  toggle: (id: string) => void
}
