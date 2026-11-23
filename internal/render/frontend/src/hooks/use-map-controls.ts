import type { Graph, Route } from '../lib/graph.types'

import { countChanges, countLabel } from '../lib/graph-view'
import { mapZoom } from '../components/toolbar.config'

type MapControlsOptions = {
  graph: Graph
  flowCount?: number
  routes: (Route | null)[]
  zoom: (factor: number) => void
}

export const useMapControls = ({ graph, flowCount, routes, zoom }: MapControlsOptions) => {
  const missing = routes.filter((route) => !route).length
  const counts = flowCount === undefined
    ? [countLabel(graph.nodes.length, 'resource'), countChanges(graph.nodes)]
    : [`${flowCount} in flow`, `${graph.nodes.length} total`]

  return {
    summary: [...counts, missing ? `unrouted: ${missing}` : ''].filter(Boolean).join(' · '),
    omitted: (graph.omittedRelations ?? 0) > 0 ? `Omitted references: ${graph.omittedRelations}` : '',
    zoomIn: () => zoom(mapZoom.in),
    zoomOut: () => zoom(mapZoom.out),
  }
}
