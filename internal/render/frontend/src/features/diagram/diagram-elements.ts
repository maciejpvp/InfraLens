import { MarkerType, Position } from '@xyflow/react'
import type { Edge, EdgeMarker, EdgeMouseHandler, Node, ReactFlowInstance } from '@xyflow/react'
import { clsx } from 'clsx'
import type { CSSProperties, KeyboardEvent, MouseEvent, RefObject } from 'react'
import type { GraphEdge, ProjectedItem, ResourcesById, ServiceIcons } from '../../lib/graph.types'
import type { WorkflowCostShare } from '../costs/workflow-table'
import type { Route, Scene, Size } from './layout/layout-model'
import { flowDescriptions } from '../../lib/graph-projection.ts'
import { countLabel, relationNames } from '../../lib/graph-view'
import { activationProps } from './activation-props'
import { pipeAppearance, pipePaint } from './connection-paint'
import type { FlowPaintLayer } from './flow-path'
import { CARD, GROUP_HEADER_HEIGHT } from './layout/dimensions'
import { isDenseScene } from './layout/route-visibility'
import { edgeKey } from './layout/scene-motion.ts'
import type { MoveCard } from './use-scene-motion'

const edgeMarker: EdgeMarker = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  markerUnits: 'userSpaceOnUse',
  orient: 'auto',
}

const edgeInteractionWidth = 18
const diagramLayers = { group: 0, edge: 1, node: 2 }

const styles = {
  edge: 'group cursor-pointer outline-none transition-opacity duration-(--motion-feedback) ease-(--motion-standard)',
  selected: 'selected',
  mutedEdge: 'muted opacity-25 focus-visible:opacity-75',
  wire: 'wire transition-[filter] duration-(--motion-feedback) ease-(--motion-standard) group-hover:brightness-115 group-focus-visible:brightness-115',
  selectedWire: 'brightness-125 drop-shadow-[0_0_2px_currentColor]',
  edgeLabel:
    'edge-label pointer-events-none transition-opacity duration-(--motion-feedback) ease-(--motion-standard) absolute w-max whitespace-nowrap bg-background text-xs text-foreground',
}

export type DiagramItemData = {
  workflowUsage?: string[]
  workflowHeat?: WorkflowCostShare
  item: ProjectedItem
  depth: number
  bounds: Size
  byId: ResourcesById
  icons: ServiceIcons
  selected: boolean
  muted: boolean
  visual?: CSSProperties
  retiring: boolean
  drag?: { moveCard: MoveCard; flow: DiagramFlowRef }
  onItem: (id: string, action?: 'pointer' | 'connections') => void
  canIsolate: boolean
  toggle: (id: string) => void
}

export type DiagramNode = Node<DiagramItemData, 'resource'>

type RelationData = {
  index: number
  route: Route
  dense: boolean
  highlighted: boolean
  wireClassName: string
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
  labelClassName: string
  opacity?: number
  retiring: boolean
}

export type DiagramRelation = Edge<RelationData, 'relation'> & { data: RelationData }

type DiagramFlowRef = RefObject<ReactFlowInstance<DiagramNode, DiagramRelation> | null>

export type DiagramElementsOptions = {
  flow: DiagramFlowRef
  scene: Scene
  moveCard: MoveCard
  byId: ResourcesById
  icons: ServiceIcons
  selection?: {
    edges: readonly GraphEdge[]
    focusId?: string
  } & (
    | { item: { id: string; members: ReadonlySet<string> }; links: readonly GraphEdge[] }
    | { item?: undefined }
  )
  workflowPath?: { nodes: ReadonlySet<string>; edges: ReadonlySet<GraphEdge> }
  onlyConnections: boolean
  workflowUsage?: ReadonlyMap<string, string[]>
  workflowHeat?: ReadonlyMap<string, WorkflowCostShare>
  onItem: DiagramItemData['onItem']
  canIsolate: boolean
  onEdges: (edges: GraphEdge[], edgeId: string) => void
  toggle: (id: string) => void
}

export const buildDiagramElements = ({
  flow,
  scene,
  moveCard,
  byId,
  icons,
  selection,
  onlyConnections,
  workflowPath,
  workflowUsage,
  workflowHeat,
  onItem,
  canIsolate,
  onEdges,
  toggle,
}: DiagramElementsOptions) => {
  const { current, layout, routes, motion } = scene
  const dense = isDenseScene(scene)
  const related = new Set(selection?.item ? selection.links : selection?.edges)
  const selectedNodes = new Set<string>()
  const focusId = selection?.focusId
  let selectedEndpoint: string | undefined
  if (focusId && selection.edges.some((edge) => edge.from === focusId || edge.to === focusId)) {
    selectedEndpoint = current.representatives.get(focusId)
  }
  if (selection?.item) {
    selectedNodes.add(selection.item.id)
    for (const id of selection.item.members) selectedNodes.add(current.representatives.get(id) ?? id)
  }
  if (selectedEndpoint) selectedNodes.add(selectedEndpoint)

  if (workflowPath) {
    selectedNodes.clear()
    for (const id of workflowPath.nodes) {
      selectedNodes.add(current.representatives.get(id) ?? id)
    }
  }
  const relatedEdges = current.edges.map((edge) => edge.originals.some(
    (original) => (workflowPath?.edges ?? related).has(original),
  ))
  const visible = new Set(selectedNodes)
  for (const [index, edge] of current.edges.entries()) {
    if (!relatedEdges[index] || !routes[index]) continue
    visible.add(edge.from)
    visible.add(edge.to)
    if (!selection?.item && !selectedEndpoint) {
      selectedNodes.add(edge.from)
      selectedNodes.add(edge.to)
    }
  }

  if (workflowPath) {
    for (const id of selectedNodes) {
      let parent = current.items.get(id)?.parent
      while (parent) {
        visible.add(parent.id)
        parent = parent.parent
      }
    }
  }

  const openEdge = (event: MouseEvent<Element> | KeyboardEvent<SVGGElement>, index: number) => {
    let matches = [current.edges[index]]
    if (
      event.type === 'click' &&
      'clientX' in event &&
      (event.clientX || event.clientY)
    ) {
      const paths = event.currentTarget.closest('.react-flow')?.querySelectorAll<SVGPathElement>(
        '[data-edge] .react-flow__edge-interaction',
      )
      const transform = paths?.[0]?.getScreenCTM()
      if (transform && paths) {
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
        matches = [...paths].flatMap((path) => {
          const edgeIndex = Number(path.closest('[data-edge]')!.getAttribute('data-edge'))
          return edgeIndex === index || path.isPointInStroke(point) ? [current.edges[edgeIndex]] : []
        })
      }
    }
    onEdges([...new Set(matches.flatMap((edge) => edge.originals))], edgeKey(current.edges[index]))
  }

  // Layout gives absolute positions in parent-first order. React Flow expects child offsets.
  const nodes = [...layout.positions].map<DiagramNode>(([id, position]) => {
    const item = current.items.get(id)!
    const parentId = item.parent?.id
    const parent = parentId ? layout.positions.get(parentId) : undefined
    const retiring = Boolean(motion && !motion.activeItems.has(id))
    const fading = motion?.fading.get(id)
    let clipPath: string | undefined
    if (fading !== undefined && parent) {
      const top = Math.max(0, parent.y + GROUP_HEADER_HEIGHT - position.y)
      const right = Math.max(0, position.x + position.width - parent.x - parent.width)
      const bottom = Math.max(0, position.y + position.height - parent.y - parent.height)
      const left = Math.max(0, parent.x - position.x)
      clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`
    }
    let zIndex: number = diagramLayers.node
    if (scene.dragging === id) zIndex++
    else if (item.expanded) zIndex = diagramLayers.group

    return {
      id,
      parentId,
      type: 'resource',
      position: { x: position.x - (parent?.x ?? 0), y: position.y - (parent?.y ?? 0) },
      // React Flow tracks fixed anchors. ELK sizes the visual groups independently.
      ...CARD,
      measured: CARD,
      // BaseEdge uses our planned path. These anchors let React Flow resolve both endpoints immediately.
      handles: [
        { type: 'source', position: Position.Right, x: CARD.width, y: CARD.height / 2 },
        { type: 'target', position: Position.Left, x: 0, y: CARD.height / 2 },
      ],
      zIndex,
      data: {
        item,
        workflowUsage: workflowUsage?.get(id),
        workflowHeat: workflowHeat?.get(id),
        retiring,
        visual: { opacity: fading, clipPath },
        drag: !retiring && !item.expanded && parentId ? { moveCard, flow } : undefined,
        depth: position.depth,
        bounds: { width: position.width, height: position.height },
        byId,
        icons,
        onItem,
        canIsolate,
        toggle,
        selected: selectedNodes.has(id),
        muted: !onlyConnections && Boolean((selection || workflowPath) && !visible.has(id)),
      },
    }
  })

  const edges = current.edges.flatMap<DiagramRelation>((edge, index) => {
    const route = routes[index]
    if (!route) return []
    const { from, to, kind, originals } = edge
    const selected = (workflowPath || !selection?.item) && relatedEdges[index]
    const muted = !onlyConnections && (selection || workflowPath) && !relatedEdges[index]
    const inferred = originals.some((original) => original.evidence.some(({ source }) => source === 'cost-workflow'))
    const title = `${current.items.get(from)!.name} → ${current.items.get(to)!.name}`
    const description = flowDescriptions([edge])
      .map(({ label }) => label)
      .join(', ')
    const paint = pipePaint[kind]
    const retiring = Boolean(motion && index >= motion.activeEdges)

    return [
      {
        id: edgeKey(edge),
        source: from,
        target: to,
        type: 'relation',
        zIndex: diagramLayers.edge,
        ariaRole: 'button',
        focusable: !retiring,
        ariaLabel: `${title}, ${relationNames[kind]}, ${description}, ${countLabel(originals.length, 'connection')}`,
        className: clsx(styles.edge, kind, selected && styles.selected, muted && styles.mutedEdge),
        markerEnd: { ...edgeMarker, color: pipeAppearance[kind].color },
        interactionWidth: retiring ? 0 : edgeInteractionWidth,
        style: inferred ? { ...paint.wire, strokeDasharray: '10 7' } : paint.wire,
        domAttributes: {
          'data-edge': index,
          'data-edge-id': edgeKey(edge),
          'data-from': from,
          'data-to': to,
          'data-count': originals.length,
          'data-workflow-edge': Boolean(workflowPath && relatedEdges[index]),
          'data-inferred-workflow-edge': inferred,
          'aria-haspopup': retiring ? undefined : 'dialog',
          'aria-hidden': retiring,
          onKeyDown: activationProps<SVGGElement>((event) => openEdge(event, index)).onKeyDown,
        },
        data: {
          index,
          dense,
          highlighted: relatedEdges[index],
          retiring,
          opacity: motion?.edgeOpacity.get(index),
          route,
          underlay: inferred ? undefined : paint.underlay,
          stream: inferred ? undefined : paint.stream,
          wireClassName: clsx(styles.wire, selected && styles.selectedWire),
          labelClassName: clsx(styles.edgeLabel, muted && styles.mutedEdge),
        },
      },
    ]
  })

  const onEdgeClick: EdgeMouseHandler<DiagramRelation> = (event, edge) => {
    if (!edge.data.retiring) openEdge(event, edge.data.index)
  }

  return { nodes, edges, onEdgeClick, dense }
}
