import { Minus, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Input } from './ui/input'
import { NativeSelect, NativeSelectOption } from './ui/native-select'
import { countLabel } from '../lib/graph-view'

const panel = 'material absolute z-10 rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-xl cursor-default touch-auto overscroll-contain'

export function Toolbar({ graph, search, mode, setMode, dependencies, setDependencies, topology, setTopology, onResource, inspecting }) {
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [filters, setFilters] = useState(false)
  const results = useRef(null)
  const term = query.trim().toLowerCase()
  const matches = showResults && term
    ? graph.nodes.filter(node => `${node.name} ${node.type} ${node.stack || ''}`.toLowerCase().includes(term))
    : null

  useEffect(() => {
    function dismiss(event) {
      if (event.key === 'Escape' && !inspecting) {
        setFilters(false)
        setShowResults(false)
      }
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [inspecting])

  function searchKeys(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter') return
    const first = results.current.querySelector('button')
    if (event.key === 'ArrowDown') first?.focus()
    else first?.click()
    event.preventDefault()
  }

  return <>
    <div aria-label="Diagram tools" className={`${panel} inset-x-2.5 top-2.5 flex min-h-15 flex-wrap items-center justify-between gap-2 p-2 min-[621px]:inset-x-4 min-[621px]:top-[max(1rem,env(safe-area-inset-top))] min-[621px]:flex-nowrap min-[621px]:gap-3`}>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xl text-primary" aria-hidden="true">◈</span>
        <span className="hidden font-semibold lg:inline">InfraLens</span>
        <Badge id="provenance" variant="secondary" className={graph.simulated ? 'border-amber-700/50 bg-amber-950 text-amber-200 text-[.6rem] sm:text-xs' : 'text-[.6rem] sm:text-xs'}>
          {graph.simulated ? 'SIMULATION' : 'STATE / PREVIEW'}
        </Badge>
      </div>
      <div className="relative order-last w-full min-[621px]:order-0 min-[621px]:ml-auto min-[621px]:max-w-96">
        <label className="sr-only" htmlFor="search">Search resources</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id="search" ref={search} type="search" placeholder="Search resources or groups…" autoComplete="off" aria-controls="results"
          className="h-10 bg-background pl-9"
          onInput={event => { setQuery(event.currentTarget.value); setShowResults(true) }} onKeyDown={searchKeys} />
        <div id="results" ref={results} aria-live="polite" hidden={!matches} className="absolute top-full left-0 mt-2 max-h-[50dvh] w-full min-[621px]:min-w-72 overflow-auto rounded-lg border bg-card shadow-lg">
          {matches?.length ? matches.map(node => (
            <Button key={node.id} data-resource={node.id} variant="ghost" className="block h-auto w-full rounded-none border-b px-3 py-2 text-left whitespace-normal wrap-anywhere last:border-0"
              onClick={() => { onResource(node.id); setShowResults(false) }}>
              {node.name}<span className="mt-0.5 block text-xs text-muted-foreground">{node.stack || node.type}</span>
            </Button>
          )) : matches && <p className="p-3 text-sm">No resources found.</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div role="group" aria-label="View" className="flex gap-0.5 rounded-lg border bg-background p-0.5">
          <Button id="flow-view" size="sm" variant={mode === 'flow' ? 'secondary' : 'ghost'} aria-pressed={mode === 'flow'} className="max-sm:px-2 max-sm:text-xs" onClick={() => setMode('flow')}>Flow</Button>
          <Button id="infra-view" size="sm" variant={mode === 'infra' ? 'secondary' : 'ghost'} aria-pressed={mode === 'infra'} className="max-sm:px-2 max-sm:text-xs" onClick={() => setMode('infra')}>Infrastructure</Button>
        </div>
        <Button id="filter-button" variant="ghost" size="icon-lg" aria-label="Filters and legend" aria-expanded={filters} aria-controls="filters" onClick={() => setFilters(!filters)}>
          <SlidersHorizontal />
        </Button>
      </div>
    </div>
    <section id="filters" aria-label="Filters and legend" hidden={!filters}
      className={`${panel} right-2.5 top-30 max-h-[calc(100dvh-10rem)] w-[min(330px,calc(100%-1.25rem))] overflow-auto p-5 text-sm min-[621px]:right-4 min-[621px]:top-22`}>
      <h2 className="mb-4 font-semibold">Diagram view</h2>
      <div className="flex items-center gap-2">
        <Checkbox id="dependencies" checked={dependencies} disabled={mode === 'flow'} onCheckedChange={setDependencies} />
        <label htmlFor="dependencies">Pulumi deployment dependencies</label>
      </div>
      <div id="topology-label" hidden={!graph.edges.some(edge => edge.state)} className="mt-4 space-y-2">
        <label htmlFor="topology">Topology</label>
        <NativeSelect id="topology" value={topology} onChange={event => setTopology(event.target.value)}>
          <NativeSelectOption value="after">After changes</NativeSelectOption>
          <NativeSelectOption value="before">Before changes</NativeSelectOption>
        </NativeSelect>
      </div>
      <ul className="my-4 space-y-2">
        <li className="flex items-center gap-2"><span className="w-6 border-t-2 border-primary" />Event / invocation</li>
        <li className="flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-violet-300" />Configuration reference</li>
        <li className="flex items-center gap-2"><span className="w-6 border-t border-dashed border-slate-400" />Deployment dependency</li>
      </ul>
      <p className="text-muted-foreground">Arrows describe configuration, not observed traffic. A Pulumi dependency does not determine data direction.</p>
      <p id="simulation-note" hidden={!graph.simulated} className="mt-3 text-muted-foreground">Simulation uses mocked provider responses. “+ create” means comparison with an empty state.</p>
    </section>
  </>
}

export function MapControls({ graph, current, routes, zoomLabel, zoom, fit }) {
  const missing = routes.filter(route => !route).length
  return <>
    <div role="group" aria-label="Zoom" className={`${panel} bottom-[max(.75rem,env(safe-area-inset-bottom))] left-2.5 flex items-center p-1 sm:left-4`}>
      <Button id="zoom-out" size="icon-lg" variant="ghost" aria-label="Zoom out" onClick={() => zoom(1.25)}><Minus /></Button>
      <output id="zoom-label" ref={zoomLabel} className="min-w-12 text-center text-xs text-muted-foreground tabular-nums">100%</output>
      <Button id="zoom-in" size="icon-lg" variant="ghost" aria-label="Zoom in" onClick={() => zoom(.8)}><Plus /></Button>
      <Button id="fit" size="sm" variant="ghost" className="ml-1" onClick={fit}>Fit</Button>
    </div>
    <div className="pointer-events-none absolute right-3 bottom-4 max-w-[calc(100%-13rem)] rounded-lg border bg-card/95 p-2 text-[.625rem] text-muted-foreground sm:right-4 sm:text-xs">
      <span id="summary">{countLabel(graph.nodes.length, 'resource')} · {countLabel(current.roots.length, 'stack')}{missing ? ` · unrouted: ${missing}` : ''}</span>
      {graph.omittedRelations > 0 && <span id="omitted" className="ml-2 hidden lg:inline">Omitted references: {graph.omittedRelations}</span>}
    </div>
  </>
}
