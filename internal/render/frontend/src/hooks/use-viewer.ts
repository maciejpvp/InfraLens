import type {
  Graph,
  GraphEdge,
  Hierarchy,
  HierarchyItem,
  ServiceIcons,
  Topology,
  ViewMode,
} from '../lib/graph.types'
import type { InspectorOrigin, InspectorPage, OpenRelation, OpenResource } from '../lib/inspector.types'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildHierarchy, projectGraph, revealResource } from '../lib/graph-projection.ts'
import { useDiagramLayout } from './use-diagram-layout'
import { useCamera } from './use-camera'
import { useInspector } from './use-inspector'
import { diagramElement } from '../lib/graph-view'
import { defaultTopology } from '../lib/layout.config'

export const useViewer = (graph: Graph, icons: ServiceIcons) => {
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph])
  const [{ topology, tree }, setTopology] = useState<{ topology: Topology; tree: Hierarchy }>(() => ({
    topology: defaultTopology,
    tree: buildHierarchy(graph),
  }))
  const [expanded, setExpanded] = useState(tree.initialExpanded)
  const [mode, setMode] = useState<ViewMode>(tree.flowIDs.size ? 'flow' : 'infra')
  const [dependencies, setDependencies] = useState(true)
  const stage = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const zoomLabel = useRef<HTMLOutputElement>(null)
  const reveal = useRef<string | null>(null)
  const toggleFocus = useRef<string | null>(null)
  const current = useMemo(
    () => projectGraph(tree, mode, dependencies, expanded),
    [tree, mode, dependencies, expanded],
  )
  const { scene, layoutPending, layoutFailed } = useDiagramLayout(tree, current)
  const camera = useCamera(stage, search, zoomLabel, scene)
  const inspector = useInspector((origin) => {
    if (typeof origin === 'string') return diagramElement(stage.current, 'item', origin) || search.current
    if (origin?.edge !== undefined)
      return diagramElement(stage.current, 'edge', origin.edge) || search.current
    return search.current
  })
  const selection = inspector.pages.at(-1)

  useLayoutEffect(() => {
    if (!scene) return
    if (reveal.current) {
      const id = reveal.current
      reveal.current = null
      const position = scene.layout.positions.get(id)
      if (position) camera.center(position, scene.current.items.get(id)?.expanded ?? false)
    }
    if (toggleFocus.current) {
      diagramElement(stage.current, 'toggle', toggleFocus.current)?.focus({ preventScroll: true })
      toggleFocus.current = null
    }
  }, [scene])

  const changeTopology = (value: Topology) => {
    const next = buildHierarchy(graph, value)
    setTopology({ topology: value, tree: next })
    setExpanded((previous) => new Set([...previous, ...next.initialExpanded]))
  }

  const toggle = (id: string) => {
    toggleFocus.current = id
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const resourcePage = (item: HierarchyItem, edges = tree.edges): InspectorPage => {
    const links = edges.filter((edge) => item.members.has(edge.from) || item.members.has(edge.to))
    return {
      item,
      links,
      ids: [...item.members, ...links.flatMap((edge) => [edge.from, edge.to])],
      edges: [],
    }
  }

  const edgePage = (edges: GraphEdge[]): InspectorPage => {
    return { edges, ids: edges.flatMap((edge) => [edge.from, edge.to]) }
  }

  const showResource: OpenResource = (id, trigger) => {
    const next = new Set(expanded)
    const itemId = revealResource(tree, id, next)
    if (!itemId) return
    reveal.current = itemId
    setExpanded(next)
    const page = resourcePage(tree.items.get(itemId)!)
    if (trigger) inspector.navigate(page, trigger)
    else inspector.open(page, itemId)
  }

  const openItem = (id: string) => {
    const item = scene?.tree.items.get(id)
    if (scene && item) inspector.open(resourcePage(item, scene.tree.edges), id)
  }
  const openEdges = (edges: GraphEdge[], origin: InspectorOrigin) => inspector.open(edgePage(edges), origin)
  const navigateEdges: OpenRelation = (edges, trigger) => inspector.navigate(edgePage(edges), trigger)

  return {
    stageProps: { ref: stage, 'aria-busy': layoutPending },
    layoutFailed,
    isEmpty: graph.nodes.length === 0,
    diagramProps: scene && {
      camera,
      scene,
      byId,
      icons,
      selection,
      toggle,
      onItem: openItem,
      onEdges: openEdges,
    },
    toolbarProps: {
      graph,
      search,
      mode,
      setMode,
      dependencies,
      setDependencies,
      topology,
      setTopology: changeTopology,
      onResource: showResource,
      inspecting: Boolean(selection),
    },
    mapControlsProps: scene && {
      graph,
      current: scene.current,
      routes: scene.routes,
      zoomLabel,
      zoom: camera.zoom,
      fit: camera.fit,
    },
    detailsProps: { inspector, byId, onResource: showResource, onEdges: navigateEdges },
  }
}
