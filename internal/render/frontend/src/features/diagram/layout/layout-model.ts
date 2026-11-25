import type { GraphView, Hierarchy } from '../../../lib/graph.types.ts'

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Position = Point & Size & { depth: number }

export type RouteLabel = { text: string; style: { left: number; top: number } }
export type Route = { points: Point[]; d: string; label?: RouteLabel }

const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
const toward = (a: Point, b: Point, step: number): Point => ({
  x: a.x + Math.sign(b.x - a.x) * step,
  y: a.y + Math.sign(b.y - a.y) * step,
})

export function roundedRoute({ points, d }: Route) {
  if (points.length < 3) return d
  const commands = [`M${points[0].x} ${points[0].y}`]
  for (let i = 1; i < points.length - 1; i++) {
    const [a, corner, b] = [points[i - 1], points[i], points[i + 1]]
    const before = distance(a, corner), after = distance(corner, b)
    const radius = Math.min(5, before / 2, after / 2, i === points.length - 2 ? after - 8 : Infinity)
    if (radius <= 0 || (a.x === corner.x) === (b.x === corner.x)) {
      commands.push(`L${corner.x} ${corner.y}`)
      continue
    }
    const enter = toward(corner, a, radius), exit = toward(corner, b, radius)
    commands.push(`L${enter.x} ${enter.y} Q${corner.x} ${corner.y} ${exit.x} ${exit.y}`)
  }
  const end = points.at(-1)!
  commands.push(`L${end.x} ${end.y}`)
  return commands.join(' ')
}

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
