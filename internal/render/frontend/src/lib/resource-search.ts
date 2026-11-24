import type { Resource, Service } from './graph.types.ts'
import { serviceFor } from './graph-projection.ts'
import { changeLabels } from './graph-view.config.ts'

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

const normalize = (value: string) =>
  value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const words = (value: string) => [...new Set([
  ...normalize(value).split(' '),
  ...normalize(value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')).split(' '),
])].filter(Boolean)

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
    return { node, service, values, name: normalize(node.name), fields: [node.name, service.name, node.type, labels.stack].map(words) }
  })
  const sorted = (facet: SearchFacet) => [...options[facet].values()].sort((a, b) => a.label.localeCompare(b.label))
  return { entries, facets: { service: sorted('service'), stack: sorted('stack'), change: sorted('change') } }
}

const oneEditApart = (term: string, word: string) => {
  if (Math.abs(term.length - word.length) > 1) return false
  if (term.length > word.length) return oneEditApart(word, term)
  let i = 0
  while (i < term.length && term[i] === word[i]) i++
  if (term.length < word.length) return term.slice(i) === word.slice(i + 1)
  const rest = term.slice(i + 1)
  return rest === word.slice(i + 1)
    || (term[i] === word[i + 1] && term[i + 1] === word[i] && term.slice(i + 2) === word.slice(i + 2))
}

const wordRank = (term: string, word: string) => {
  if (word === term) return 0
  if (word.startsWith(term)) return 1
  if (word.includes(term)) return 2
  return term.length >= 4 && oneEditApart(term, word) ? 3 : Infinity
}

const score = ({ name, fields }: SearchEntry, query: string, terms: string[]) => {
  if (!query) return 0
  if (name === query) return -2
  if (name.startsWith(query)) return -1
  let score = 0
  for (const term of terms) {
    let best = Infinity
    for (const [field, words] of fields.entries()) {
      for (const word of words) best = Math.min(best, wordRank(term, word) * fields.length + field)
      if (best === 0) break
    }
    if (best === Infinity) return Infinity
    score += best
  }
  return score
}

export const searchResources = (entries: SearchEntry[], text: string, filters: SearchFilters) => {
  const query = normalize(text)
  const terms = query.split(' ')
  if (text.trim() && !query) return []
  return entries.flatMap((entry) => {
    if (searchFacets.some((facet) => filters[facet]?.size && !filters[facet].has(entry.values[facet]))) return []
    const rank = score(entry, query, terms)
    return Number.isFinite(rank) ? [{ ...entry, rank }] : []
  }).sort((a, b) => a.rank - b.rank || a.node.name.localeCompare(b.node.name)
    || a.values.stack.localeCompare(b.values.stack) || a.node.id.localeCompare(b.node.id))
}
