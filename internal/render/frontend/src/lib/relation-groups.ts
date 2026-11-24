import type { GraphEdge } from './graph.types.ts'

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
