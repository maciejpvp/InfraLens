import type { Graph, GraphView, Route } from '../lib/graph.types'

import { countLabel } from '../lib/graph-view'
import { mapZoom } from '../components/toolbar.config'

type MapControlsOptions = {
  graph: Graph
  current: GraphView
  routes: (Route | null)[]
  zoom: (factor: number) => void
}

export const useMapControls = ({ graph, current, routes, zoom }: MapControlsOptions) => {
  const missing = routes.filter((route) => !route).length
  const resources = countLabel(graph.nodes.length, 'resource')
  const stacks = countLabel(current.roots.length, 'stack')

  return {
    summary: `${resources} · ${stacks}${missing ? ` · unrouted: ${missing}` : ''}`,
    omitted: (graph.omittedRelations ?? 0) > 0 ? `Omitted references: ${graph.omittedRelations}` : '',
    zoomIn: () => zoom(mapZoom.in),
    zoomOut: () => zoom(mapZoom.out),
  }
}
