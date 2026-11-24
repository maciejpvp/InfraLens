import type { GraphView, Hierarchy } from '../../../lib/graph.types.ts'

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Position = Point & Size & { depth: number }

export type RouteLabel = { text: string; style: { left: number; top: number } }
export type Route = { points: Point[]; d: string; label?: RouteLabel }
export type Layout = Size & { left?: number; top?: number; positions: Map<string, Position> }
export type DiagramLayout = { layout: Layout; routes: (Route | null)[] }
export type Scene = DiagramLayout & {
  tree: Hierarchy
  current: GraphView
  dragging?: string
  motion?: {
    fading: Map<string, number>
    edgeOpacity: Map<number, number>
    activeItems: Set<string>
    activeEdges: number
  }
}
