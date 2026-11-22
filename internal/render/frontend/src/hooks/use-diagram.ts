import type { KeyboardEvent, MouseEvent } from 'react'
import type { EdgeMouseHandler } from '@xyflow/react'
import type { DiagramNode, DiagramProps, DiagramRelation } from '../component/diagram/diagram.types'
import type { Point, Route } from '../lib/graph.types'

import { clsx } from 'clsx'
import { Position } from '@xyflow/react'
import {
  diagramLayers,
  edgeAppearance,
  edgeInteractionWidth,
  edgeMarker,
} from '../component/diagram/diagram.config'
import { diagramStyles as styles } from '../component/diagram/diagram.variants'
import { activationProps } from '../lib/activation-props'
import { countLabel } from '../lib/graph-view'
import { relationNames } from '../lib/graph-view.config'
import { flowDescriptions } from '../lib/graph-projection.ts'
import { CARD } from '../lib/layout.config'

const routeContains = (route: Route, point: Point) =>
  route.points.slice(1).some((end, index) => {
    const start = route.points[index]
    const radius = edgeInteractionWidth / 2
    const horizontal = start.y === end.y
    const along = horizontal ? 'x' : 'y'
    const across = horizontal ? 'y' : 'x'
    return (
      point[along] >= Math.min(start[along], end[along]) &&
      point[along] <= Math.max(start[along], end[along]) &&
      Math.abs(point[across] - start[across]) <= radius
    )
  })

export const useDiagram = ({
  camera,
  scene,
  byId,
  icons,
  selection,
  onItem,
  onEdges,
  toggle,
}: DiagramProps) => {
  const { current, layout, routes } = scene
  const visible = new Set(selection?.ids.map((id) => current.representatives.get(id) || id))

  const openEdge = (event: MouseEvent<Element> | KeyboardEvent<SVGGElement>, index: number) => {
    let matches = [current.edges[index]]
    if (
      event.type === 'click' &&
      'clientX' in event &&
      (event.clientX || event.clientY) &&
      camera.flow.current
    ) {
      const point = camera.flow.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const hits = current.edges.filter((_, i) => {
        const route = routes[i]
        return route && routeContains(route, point)
      })
      if (hits.length) matches = hits
    }
    onEdges([...new Set(matches.flatMap((edge) => edge.originals))], { edge: String(index) })
  }

  // Layout gives absolute positions in parent-first order. React Flow expects child offsets.
  const nodes = [...layout.positions].map<DiagramNode>(([id, position]) => {
    const item = current.items.get(id)!
    const parentId = item.parent?.id
    const parent = parentId ? layout.positions.get(parentId) : undefined
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
      zIndex: item.expanded ? diagramLayers.group : diagramLayers.node,
      data: {
        item,
        depth: position.depth,
        bounds: { width: position.width, height: position.height },
        byId,
        icons,
        onItem,
        toggle,
        selected: visible.has(id),
        muted: Boolean(selection && !visible.has(id)),
      },
    }
  })

  const edges = current.edges.flatMap<DiagramRelation>((edge, index) => {
    const route = routes[index]
    if (!route) return []
    const { from, to, kind, state, originals } = edge
    const selected = originals.some((original) => selection?.edges.includes(original))
    const muted = selection && (!visible.has(from) || !visible.has(to))
    const title = `${current.items.get(from)!.name} → ${current.items.get(to)!.name}`
    const description = flowDescriptions([edge])
      .map(({ label }) => label)
      .join(', ')
    const appearance = edgeAppearance[kind]

    return [
      {
        id: JSON.stringify([from, kind, to, state]),
        source: from,
        target: to,
        type: 'relation',
        zIndex: diagramLayers.edge,
        ariaRole: 'button',
        ariaLabel: `${title}, ${relationNames[kind]}, ${description}, ${countLabel(originals.length, 'connection')}`,
        className: clsx(styles.edge, kind, selected && styles.selected, muted && styles.mutedEdge),
        markerEnd: { ...edgeMarker, color: appearance.color },
        interactionWidth: edgeInteractionWidth,
        style: {
          stroke: appearance.color,
          strokeWidth: appearance.width,
          strokeDasharray: appearance.dash,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        domAttributes: {
          'data-edge': index,
          'data-from': from,
          'data-to': to,
          'data-count': originals.length,
          'aria-haspopup': 'dialog',
          onKeyDown: activationProps<SVGGElement>((event) => openEdge(event, index)).onKeyDown,
        },
        data: {
          index,
          path: route.d,
          wireClassName: clsx(styles.wire, selected && styles.selectedWire),
          label: route.label,
          labelClassName: clsx(styles.edgeLabel, muted && styles.mutedEdge),
        },
      },
    ]
  })

  const onEdgeClick: EdgeMouseHandler<DiagramRelation> = (event, edge) => openEdge(event, edge.data.index)

  return { nodes, edges, onEdgeClick }
}
