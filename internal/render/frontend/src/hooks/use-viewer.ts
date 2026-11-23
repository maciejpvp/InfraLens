import { useConnectionLegend } from './use-connection-legend'
import type {
  Graph,
  GraphEdge,
  HierarchyItem,
  ServiceIcons,
  Topology,
  ViewMode,
} from '../lib/graph.types'
import type { InspectorOrigin, InspectorPage, OpenRelation, OpenResource } from '../lib/inspector.types'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { activeEdges, buildHierarchy, isFlow, projectGraph, revealResource } from '../lib/graph-projection.ts'
import { useDiagramLayout } from './use-diagram-layout'
import { useCamera } from './use-camera'
import { useInspector } from './use-inspector'
import { diagramElement } from '../lib/graph-view'
import { defaultTopology } from '../lib/layout.config'

export const useViewer = (graph: Graph, icons: ServiceIcons) => {
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph])
  const [topology, setTopology] = useState<Topology>(defaultTopology)
  const [mode, setMode] = useState<ViewMode>(() =>
    activeEdges(graph, defaultTopology).some(isFlow) ? 'flow' : 'infra',
  )
  const infra = useMemo(() => buildHierarchy(graph, topology), [graph, topology])
  const tree = useMemo(() => mode === 'flow' ? buildHierarchy(graph, topology, 'flow') : infra, [graph, topology, mode, infra])
  const [expansions, setExpansions] = useState<Record<string, ReadonlySet<string>>>({})
  const expansionKey = `${topology}:${mode}`
  const expanded = expansions[expansionKey] ?? tree.initialExpanded
  const fitAfterLayout = useRef(false)
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
  const { scene, moveCard, layoutPending, layoutFailed } = useDiagramLayout(tree, current, toggleFocus)
  const legendProps = useConnectionLegend()
  const camera = useCamera(stage, search, zoomLabel, scene, legendProps.legendRef)
  const inspector = useInspector((origin) => {
    if (typeof origin === 'string') return diagramElement(stage.current, 'item', origin) || search.current
    if (origin?.edge !== undefined)
      return diagramElement(stage.current, 'edge', origin.edge) || search.current
    return search.current
  })
  const selection = inspector.pages.at(-1)

  useLayoutEffect(() => {
    if (!scene || scene.motion || scene.current !== current) return
    if (fitAfterLayout.current) {
      fitAfterLayout.current = false
      camera.fit()
    }
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
  }, [scene, current])

  const toggle = (id: string) => {
    toggleFocus.current = id
    setExpansions((previous) => {
      const next = new Set(previous[expansionKey] ?? tree.initialExpanded)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...previous, [expansionKey]: next }
    })
  }

  const resourcePage = (item: HierarchyItem, edges = tree.edges): InspectorPage => {
    const links = edges.filter((edge) => item.members.has(edge.from) || item.members.has(edge.to))
    return {
      item,
      links,
      edges: [],
    }
  }

  const edgePage = (edges: GraphEdge[]): InspectorPage => {
    return { edges }
  }

  const showResource: OpenResource = (id, trigger) => {
    const target = tree.resourceItems.has(id) ? tree : infra
    const key = target === tree ? expansionKey : `${topology}:infra`
    const next = new Set(expansions[key] ?? target.initialExpanded)
    const itemId = revealResource(target, id, next)
    if (!itemId) return
    reveal.current = itemId
    if (target !== tree) setMode('infra')
    setExpansions((previous) => ({ ...previous, [key]: next }))
    const page = resourcePage(target.items.get(itemId)!)
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
    stageProps: {
      ref: stage,
      'aria-busy': layoutPending || Boolean(scene?.motion),
      'data-inspecting': Boolean(selection),
      'data-pipe-motion': legendProps.playing ? 'on' : 'off',
    },
    legendProps,
    layoutFailed,
    isEmpty: graph.nodes.length === 0,
    noFlow: graph.nodes.length > 0 && mode === 'flow' && !tree.flowIDs.size,
    diagramProps: scene && {
      camera,
      scene,
      moveCard,
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
      setMode: (value: ViewMode) => {
        if (value === mode) return
        fitAfterLayout.current = true
        setMode(value)
      },
      dependencies,
      setDependencies,
      topology,
      setTopology,
      onResource: showResource,
      inspecting: Boolean(selection),
    },
    mapControlsProps: scene && {
      graph,
      flowCount: mode === 'flow' ? tree.flowIDs.size : undefined,
      routes: scene.routes,
      zoomLabel,
      zoom: camera.zoom,
      fit: camera.fit,
    },
    detailsProps: { inspector, byId, onResource: showResource, onEdges: navigateEdges },
  }
}
