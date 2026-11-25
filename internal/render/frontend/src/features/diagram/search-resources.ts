import { serviceFor } from '../../lib/graph-projection.ts'
import { normalizeSearch, searchWords, searchRank } from '../../lib/fuzzy-search.ts'
import { changeLabels } from '../../lib/graph-view.ts'
import type { Resource, Service } from '../../lib/graph.types.ts'

export const searchFacets = ['service', 'stack', 'change'] as const
export type SearchFacet = typeof searchFacets[number]
export type SearchFilters = Partial<Record<SearchFacet, ReadonlySet<string>>>

type FacetOption = { value: string; label: string; count: number; service?: Service }
type SearchEntry = {
  node: Resource
  service: Service
  values: Record<SearchFacet, string>
  name: string
  fields: string[][]
}

export const indexResources = (nodes: Resource[]) => {
  const options = { service: new Map<string, FacetOption>(), stack: new Map<string, FacetOption>(), change: new Map<string, FacetOption>() }
  const entries: SearchEntry[] = nodes.map((node) => {
    const service = { ...serviceFor(node), icon: node.provider === 'aws' ? node.service || null : null }
    const change = node.change ?? 'unchanged'
    const values = { service: service.id, stack: node.stack || '', change }
    const labels = { service: service.name, stack: values.stack || 'No stack', change: change === 'unchanged' ? 'Unchanged' : changeLabels[change] }
    for (const facet of searchFacets) {
      const value = values[facet]
      const option = options[facet].get(value)
      if (option) option.count++
      else options[facet].set(value, { value, label: labels[facet], count: 1, service: facet === 'service' ? service : undefined })
    }
    return { node, service, values, name: normalizeSearch(node.name), fields: [node.name, service.name, node.type, labels.stack].map(searchWords) }
  })
  const sorted = (facet: SearchFacet) => [...options[facet].values()].sort((a, b) => a.label.localeCompare(b.label))
  return { entries, facets: { service: sorted('service'), stack: sorted('stack'), change: sorted('change') } }
}

export const searchResources = (entries: SearchEntry[], text: string, filters: SearchFilters) => {
  const query = normalizeSearch(text)
  const terms = query.split(' ')
  if (text.trim() && !query) return []
  return entries.flatMap((entry) => {
    if (searchFacets.some((facet) => filters[facet]?.size && !filters[facet].has(entry.values[facet]))) return []
    const rank = searchRank(entry, query, terms)
    return Number.isFinite(rank) ? [{ ...entry, rank }] : []
  }).sort((a, b) => a.rank - b.rank || a.node.name.localeCompare(b.node.name)
    || a.values.stack.localeCompare(b.values.stack) || a.node.id.localeCompare(b.node.id))
}
