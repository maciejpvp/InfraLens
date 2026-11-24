import type { RefObject, ChangeEvent } from 'react'
import type { Graph, ServiceIcons, Topology, ViewMode } from '../lib/graph.types'
import type { OpenResource } from '../lib/inspector.types'
import type { SearchFacet, SearchFilters } from '../lib/resource-search'

import { useEffect, useMemo, useRef, useState } from 'react'
import { viewModes } from '../components/toolbar.config'
import { indexResources, searchFacets, searchResources } from '../lib/resource-search'

type ToolbarOptions = {
  graph: Graph
  icons: ServiceIcons
  search: RefObject<HTMLInputElement | null>
  mode: ViewMode
  setMode: (mode: ViewMode) => void
  dependencies: boolean
  setDependencies: (checked: boolean) => void
  topology: Topology
  setTopology: (topology: Topology) => void
  onResource: OpenResource
  inspecting: boolean
  connectionScope?: { checked: boolean; change: (checked: boolean) => void }
}

const pageSize = 50
const emptyFilters: SearchFilters = {}

export const useToolbar = ({
  graph,
  icons,
  search,
  mode,
  setMode,
  dependencies,
  setDependencies,
  topology,
  setTopology,
  onResource,
  inspecting,
  connectionScope,
}: ToolbarOptions) => {
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState<'results' | 'searchFilters' | 'diagramFilters' | null>(null)
  const [selection, setSelection] = useState<{ graph: Graph; filters: SearchFilters }>()
  const [pagination, setPagination] = useState<{ graph: Graph; index: number }>()
  const searchFilters = selection?.graph === graph ? selection.filters : emptyFilters
  const searchRoot = useRef<HTMLDivElement>(null)
  const { entries, facets } = useMemo(() => indexResources(graph.nodes), [graph.nodes])
  const activeCount = searchFacets.reduce((count, facet) => count + (searchFilters[facet]?.size ?? 0), 0)
  const searching = panel === 'results' && Boolean(query.trim() || activeCount)
  const matches = useMemo(() => searching ? searchResources(entries, query, searchFilters) : [],
    [searching, entries, query, searchFilters])
  const page = pagination?.graph === graph ? pagination.index : 0
  const offset = page * pageSize
  const filtersOpen = panel === 'diagramFilters'

  const selectFilter = (facet: SearchFacet, value: string, checked: boolean) => {
    setPagination(undefined)
    setSelection((previous) => {
      const filters = previous?.graph === graph ? previous.filters : {}
      const next = new Set(filters[facet])
      if (checked) next.add(value)
      else next.delete(value)
      return { graph, filters: { ...filters, [facet]: next } }
    })
  }

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !inspecting) {
        if (searchRoot.current?.contains(document.activeElement)) search.current?.focus()
        setPanel(null)
      }
    }
    const dismissSearch = (event: PointerEvent) => {
      if (event.target instanceof Node && !searchRoot.current?.contains(event.target))
        setPanel((current) => current === 'diagramFilters' ? current : null)
    }
    document.addEventListener('keydown', dismiss)
    document.addEventListener('pointerdown', dismissSearch)
    return () => {
      document.removeEventListener('keydown', dismiss)
      document.removeEventListener('pointerdown', dismissSearch)
    }
  }, [inspecting, search])

  return {
    simulated: Boolean(graph.simulated),
    provenance: graph.simulated ? 'SIMULATION' : 'STATE / PREVIEW',
    modes: viewModes.map(({ value, id, label }) => ({
      id,
      label,
      pressed: mode === value,
      variant: mode === value ? ('secondary' as const) : ('ghost' as const),
      onClick: () => setMode(value),
    })),
    filtersOpen,
    toggleFilters: () => setPanel((current) => current === 'diagramFilters' ? null : 'diagramFilters'),
    filterProps: {
      simulated: Boolean(graph.simulated),
      filtersOpen,
      showTopology: graph.edges.some((edge) => edge.state),
      topology,
      dependencies,
      dependenciesDisabled: mode === 'flow',
      connectionScope,
      setDependencies: (checked: boolean | 'indeterminate') => setDependencies(checked === true),
      changeTopology: (event: ChangeEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value
        if (value === 'before' || value === 'after') setTopology(value)
      },
    },
    searchProps: {
      search,
      searchRoot,
      icons,
      query,
      searching,
      filtersOpen: panel === 'searchFilters',
      facets,
      searchFilters,
      activeCount,
      selectFilter,
      clearFilters: () => {
        setSelection(undefined)
        setPagination(undefined)
      },
      toggleFilters: () => setPanel((current) => current === 'searchFilters' ? 'results' : 'searchFilters'),
      showResults: () => setPanel('results'),
      changeQuery: (value: string) => {
        setQuery(value)
        setPagination(undefined)
        setPanel('results')
      },
      page,
      offset,
      total: matches.length,
      changePage: (index: number) => setPagination({ graph, index }),
      results: matches.slice(offset, offset + pageSize).map(({ node: { id, name, stack, type }, service }) => ({
        id,
        name,
        service,
        description: stack ? `${type} · ${stack}` : type,
        onClick: () => {
          onResource(id)
          setPanel(null)
        },
      })),
    },
  }
}
