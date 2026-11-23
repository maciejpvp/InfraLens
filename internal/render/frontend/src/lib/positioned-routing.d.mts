import type { GraphView, Layout, Point, Position, Route } from './graph.types.ts'

export function routeEdges(view: GraphView, layout: Layout): (Route | null)[]
export function placeEdgeLabel(
  points: Point[],
  width: number,
  height: number,
  obstacles: Pick<Position, 'x' | 'y' | 'width' | 'height'>[],
): Position | null
