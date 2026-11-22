import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, RefObject, ChangeEvent } from 'react'
import type { Graph, Topology, ViewMode } from '../lib/graph.types'
import type { OpenResource } from '../lib/inspector.types'

import { useEffect, useRef, useState } from 'react'
import { viewModes } from '../component/toolbar/toolbar.config'

type ToolbarOptions = {
  graph: Graph
  search: RefObject<HTMLInputElement | null>
  mode: ViewMode
  setMode: (mode: ViewMode) => void
  dependencies: boolean
  setDependencies: (checked: boolean) => void
  topology: Topology
  setTopology: (topology: Topology) => void
  onResource: OpenResource
  inspecting: boolean
}

export const useToolbar = ({
  graph,
  search,
  mode,
  setMode,
  dependencies,
  setDependencies,
  topology,
  setTopology,
  onResource,
  inspecting,
}: ToolbarOptions) => {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [filters, setFilters] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const term = query.trim().toLowerCase()
  const searching = showResults && Boolean(term)
  const matches = searching
    ? graph.nodes.filter((node) =>
        `${node.name} ${node.type} ${node.stack || ''}`.toLowerCase().includes(term),
      )
    : []

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !inspecting) {
        setFilters(false)
        setShowResults(false)
      }
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [inspecting])

  const searchKeys = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter') return
    const first = resultsRef.current?.querySelector('button')
    if (event.key === 'ArrowDown') first?.focus()
    else first?.click()
    event.preventDefault()
  }

  const searchInput = (event: FormEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value)
    setShowResults(true)
  }

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
    filtersOpen: filters,
    toggleFilters: () => setFilters((open) => !open),
    filterProps: {
      simulated: Boolean(graph.simulated),
      filtersOpen: filters,
      showTopology: graph.edges.some((edge) => edge.state),
      topology,
      dependencies,
      dependenciesDisabled: mode === 'flow',
      setDependencies: (checked: boolean | 'indeterminate') => setDependencies(checked === true),
      changeTopology: (event: ChangeEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value
        if (value === 'before' || value === 'after') setTopology(value)
      },
    },
    searchProps: {
      search,
      resultsRef,
      searching,
      noMatches: searching && matches.length === 0,
      searchInput,
      searchKeys,
      results: matches.map(({ id, name, stack, type }) => ({
        id,
        name,
        description: stack || type,
        onClick: () => {
          onResource(id)
          setShowResults(false)
        },
      })),
    },
  }
}
