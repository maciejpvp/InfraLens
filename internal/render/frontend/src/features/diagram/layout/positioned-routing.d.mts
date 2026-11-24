import type { GraphView } from '../../../lib/graph.types.ts'
import type { Layout, Point, Position, Route } from './layout-model.ts'

export function routeEdges(view: GraphView, layout: Layout, retained?: readonly (Route | null)[]): (Route | null)[]
export function placeEdgeLabel(
  points: Point[],
  width: number,
  height: number,
  obstacles: Pick<Position, 'x' | 'y' | 'width' | 'height'>[],
): Position | null
