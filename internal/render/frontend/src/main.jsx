import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { buildHierarchy, layoutGroupedGraph, projectGraph, revealResource } from '../../layout.mjs'
import { routeEdges } from '../../routing.mjs'
import { DetailsDialog } from './components/details-dialog'
import { Diagram } from './components/diagram'
import { MapControls, Toolbar } from './components/toolbar'
import { useCamera } from './hooks/use-camera'
import { useInspector } from './hooks/use-inspector'
import { diagramElement } from './lib/graph-view'
import './theme.css'

function App({ graph, icons }) {
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph])
  const [{ topology, tree }, setTopology] = useState(() => ({ topology: 'after', tree: buildHierarchy(graph) }))
  const [expanded, setExpanded] = useState(tree.initialExpanded)
  const [mode, setMode] = useState(tree.flowIDs.size ? 'flow' : 'infra')
  const [dependencies, setDependencies] = useState(true)
  const stage = useRef(null), svg = useRef(null), search = useRef(null), zoomLabel = useRef(null)
  const reveal = useRef(null), toggleFocus = useRef(null)
  const scene = useMemo(() => {
    const current = projectGraph(tree, mode, dependencies, expanded)
    const layout = layoutGroupedGraph(current)
    return { tree, current, layout, routes: routeEdges(current, layout) }
  }, [tree, mode, dependencies, expanded])
  const camera = useCamera(stage, svg, search, zoomLabel, scene)
  const inspector = useInspector(origin => {
    if (typeof origin === 'string') return diagramElement(svg.current, 'item', origin) || search.current
    return origin?.isConnected ? origin : search.current
  })
  const selection = inspector.pages.at(-1)

  useLayoutEffect(() => {
    if (reveal.current) {
      const id = reveal.current
      reveal.current = null
      camera.center(scene.layout.positions.get(id), scene.current.items.get(id).expanded)
    }
    if (toggleFocus.current) {
      diagramElement(svg.current, 'toggle', toggleFocus.current)?.focus({ preventScroll: true })
      toggleFocus.current = null
    }
  }, [scene])

  function changeTopology(value) {
    const next = buildHierarchy(graph, value)
    setTopology({ topology: value, tree: next })
    setExpanded(previous => new Set([...previous, ...next.initialExpanded]))
  }

  function toggle(id) {
    toggleFocus.current = id
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resourcePage(item) {
    const links = tree.edges.filter(edge => item.members.has(edge.from) || item.members.has(edge.to))
    return { item, links, ids: [...item.members, ...links.flatMap(edge => [edge.from, edge.to])], edges: [] }
  }

  function edgePage(edges) {
    return { edges, ids: edges.flatMap(edge => [edge.from, edge.to]) }
  }

  function showResource(id, trigger) {
    const next = new Set(expanded)
    const itemId = revealResource(tree, id, next)
    if (!itemId) return
    reveal.current = itemId
    setExpanded(next)
    const page = resourcePage(tree.items.get(itemId))
    if (trigger) inspector.navigate(page, trigger)
    else inspector.open(page, itemId)
  }

  return <>
    <main id="stage" ref={stage} aria-label="Interactive infrastructure diagram" {...camera.stageEvents}
      className="fixed inset-0 h-dvh w-full cursor-grab touch-none overflow-hidden bg-background bg-[radial-gradient(#70839938_.8px,transparent_.8px)] bg-[length:22px_22px] text-foreground">
      <Diagram svg={svg} scene={scene} byId={byId} icons={icons} selection={selection} toggle={toggle}
        onItem={id => inspector.open(resourcePage(tree.items.get(id)), id)}
        onEdges={(edges, origin) => inspector.open(edgePage(edges), origin)} />
      <Toolbar graph={graph} search={search} mode={mode} setMode={setMode} dependencies={dependencies} setDependencies={setDependencies}
        topology={topology} setTopology={changeTopology} onResource={showResource} inspecting={Boolean(selection)} />
      <MapControls graph={graph} current={scene.current} routes={scene.routes} zoomLabel={zoomLabel} zoom={camera.zoom} fit={camera.fit} />
      <p id="empty" hidden={graph.nodes.length > 0} className="pointer-events-none absolute inset-x-[12%] top-[42%] text-center text-muted-foreground">This file contains no resources.</p>
    </main>
    <DetailsDialog inspector={inspector} byId={byId} onResource={showResource}
      onEdges={(edges, trigger) => inspector.navigate(edgePage(edges), trigger)} />
  </>
}

const data = JSON.parse(document.getElementById('infralens-data').textContent)
const graph = { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] }
const icons = JSON.parse(document.getElementById('infralens-icons').textContent)
const root = createRoot(document.getElementById('infralens-root'))
flushSync(() => root.render(<App graph={graph} icons={icons} />))
