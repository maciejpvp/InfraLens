import type { GraphEdge, ResourcesById, Service } from '../../lib/graph.types.ts'
import { serviceFor } from '../../lib/graph-projection.ts'

export type Endpoint = 'from' | 'to'

export const groupBySharedEndpoint = (edges: GraphEdge[]) => {
  const groups = new Map<string, { key: string; endpoint: Endpoint; id: string; edges: GraphEdge[] }>()
  for (const endpoint of ['from', 'to'] as const) {
    for (const edge of edges) {
      const id = edge[endpoint]
      const key = JSON.stringify([endpoint, id])
      const group = groups.get(key)
      if (group) group.edges.push(edge)
      else groups.set(key, { key, endpoint, id, edges: [edge] })
    }
  }

  const remaining = new Set(edges)
  const shared = [...groups.values()].sort((a, b) => b.edges.length - a.edges.length).flatMap((group) => {
    const available = group.edges.filter((edge) => remaining.has(edge))
    if (available.length < 2) return []
    for (const edge of available) remaining.delete(edge)
    return [{ ...group, edges: available }]
  })
  return { shared, singles: [...remaining] }
}

export const groupDependenciesByService = (edges: GraphEdge[], byId: ResourcesById) => {
  const groups = new Map<string, { key: string; from: Service; to: Service; edges: GraphEdge[] }>()
  for (const edge of edges) {
    const from = serviceFor(byId.get(edge.from))
    const to = serviceFor(byId.get(edge.to))
    const key = JSON.stringify([from.id, to.id])
    const group = groups.get(key)
    if (group) group.edges.push(edge)
    else groups.set(key, { key, from, to, edges: [edge] })
  }
  return [...groups.values()].sort((a, b) => a.from.name.localeCompare(b.from.name) ||
    a.to.name.localeCompare(b.to.name) || a.key.localeCompare(b.key))
}
