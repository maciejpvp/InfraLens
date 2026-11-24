import type { ElkExtendedEdge, ElkNode, ElkPoint } from 'elkjs/lib/elk.bundled.js'
import type { GraphView } from '../../../lib/graph.types.ts'
import type { DiagramLayout, Position, Route } from './layout-model.ts'

import { CARD, GROUP_HEADER_HEIGHT, edgeCaptionHeight, edgeCaptionPadding } from './dimensions.ts'
import ELK from 'elkjs/lib/elk.bundled.js'
import { edgeCaption } from '../../../lib/graph-projection.ts'

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '28',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  'elk.spacing.edgeEdge': '18',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
  'elk.spacing.portPort': '18',
  'elk.layered.mergeEdges': 'false',
  'elk.layered.mergeHierarchyEdges': 'false',
}

const elkGroupOptions = {
  'elk.padding': `[top=${GROUP_HEADER_HEIGHT + 20},left=20,bottom=20,right=20]`,
}

const elk = new ELK()
const nodeId = (id: string) => `node:${id}`

const toElkNode = (view: GraphView, id: string): ElkNode => {
  const item = view.items.get(id)!
  const dimensions = item.expanded
    ? { layoutOptions: elkGroupOptions, children: item.children.map((child) => toElkNode(view, child)) }
    : CARD
  return { id: nodeId(id), ...dimensions }
}

// ELK coordinates can differ by a few floating point units along a straight segment.
const round = (value: number) => Math.round(value * 1e5) / 1e5
const toPoint = ({ x, y }: ElkPoint) => ({ x: round(x), y: round(y) })
const samePoint = (a: ElkPoint, b: ElkPoint) => a.x === b.x && a.y === b.y

const toRoute = (edge: ElkExtendedEdge, text: string): Route | null => {
  const sections = edge.sections ?? []
  let section = sections.find((entry) => !entry.incomingSections?.length)
  if (!section) return null

  const points: ElkPoint[] = []
  const byId = new Map(sections.map((entry) => [entry.id, entry]))
  while (section) {
    for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
      const next = toPoint(point)
      const previous = points.at(-1)
      if (!previous || !samePoint(previous, next)) points.push(next)
    }
    const next: string | undefined = section.outgoingSections?.[0]
    section = next ? byId.get(next) : undefined
  }
  if (
    points.length < 2 ||
    points.slice(1).some((point, index) => point.x !== points[index].x && point.y !== points[index].y)
  )
    return null

  const d = points
    .map((point, index) => {
      if (index === 0) return `M${point.x} ${point.y}`
      return point.x === points[index - 1].x ? `V${point.y}` : `H${point.x}`
    })
    .join(' ')
  const title = edge.labels?.[0]
  const label =
    title?.x !== undefined && title.y !== undefined
      ? {
          text,
          style: { left: title.x + edgeCaptionPadding, top: title.y + edgeCaptionPadding },
        }
      : undefined
  return { points, d, label }
}

export const layoutDiagram = async (
  view: GraphView,
  measureText: (text: string) => number,
  direction: 'DOWN' | 'RIGHT' = 'RIGHT',
): Promise<DiagramLayout> => {
  const captions = view.edges.map(edgeCaption)
  const result = await elk.layout<ElkNode>({
    id: 'root',
    layoutOptions: { ...elkOptions, 'elk.direction': direction },
    children: view.roots.map((id) => toElkNode(view, id)),
    edges: view.edges.map(({ from, to }, index) => {
      const caption = captions[index]
      return {
        id: String(index),
        sources: [nodeId(from)],
        targets: [nodeId(to)],
        labels: caption
          ? [
              {
                text: caption,
                width: Math.ceil(measureText(caption)) + 2 * edgeCaptionPadding,
                height: edgeCaptionHeight + 2 * edgeCaptionPadding,
              },
            ]
          : [],
      }
    }),
  })

  const positions = new Map<string, Position>()
  const place = (node: ElkNode, depth: number) => {
    positions.set(node.id.slice('node:'.length), {
      ...toPoint({ x: node.x ?? 0, y: node.y ?? 0 }),
      width: node.width ?? 0,
      height: node.height ?? 0,
      depth,
    })
    node.children?.forEach((child) => place(child, depth + 1))
  }
  result.children?.forEach((node) => place(node, 0))

  const routes = Array<Route | null>(view.edges.length).fill(null)
  for (const edge of result.edges ?? []) {
    const index = Number(edge.id)
    routes[index] = toRoute(edge, captions[index])
  }
  return { layout: { positions, width: result.width ?? 0, height: result.height ?? 0 }, routes }
}
