import type { WorkflowPath } from '../features/costs/workflows'
import { workflowGraph } from '../features/costs/workflows'
import { useConnectionLegend } from '../features/diagram/connection-legend'
import type { InspectorOrigin, InspectorPage, OpenRelation, OpenResource } from '../features/inspector/use-inspector'
import type {
  Graph,
  GraphEdge,
  HierarchyItem,
  ServiceIcons,
  Topology,
  ViewMode,
} from '../lib/graph.types'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCamera } from '../features/diagram/use-camera'
import { useDiagramLayout } from '../features/diagram/use-diagram-layout'
import { useInspector } from '../features/inspector/use-inspector'
import { activeEdges, buildHierarchy, collapsedServiceAncestor, defaultTopology, isFlow, projectGraph, revealResource } from '../lib/graph-projection.ts'

const diagramElement = (
  root: HTMLElement | null,
  field: 'item' | 'toggle' | 'edge-id',
  value: string,
) => {
  if (!root) return
  return [...root.querySelectorAll<HTMLElement | SVGGElement>(`[data-${field}]`)].find(
    (element) => element.getAttribute(`data-${field}`) === value,
  )
}

function getCostWindowBounds() {
  return document.getElementById('report-cost-window')?.getBoundingClientRect()
}

const resourcePage = (item: HierarchyItem, edges: GraphEdge[]): InspectorPage => ({
  item,
  links: edges.filter((edge) => item.members.has(edge.from) || item.members.has(edge.to)),
  edges: [],
  focusId: item.group ? undefined : item.id,
})

export const useViewer = (baseGraph: Graph, icons: ServiceIcons, path?: WorkflowPath, usage?: ReadonlyMap<string, string[]>) => {
  const [topology, setTopology] = useState<Topology>(defaultTopology)
  const activePath = path?.side === topology ? path : undefined
  const graph = useMemo(() => activePath ? workflowGraph(baseGraph, activePath) : baseGraph, [baseGraph, activePath])
  const byId = useMemo(() => new Map(baseGraph.nodes.map((node) => [node.id, node])), [baseGraph])
  const [mode, setMode] = useState<ViewMode>(() =>
    activeEdges(baseGraph, defaultTopology).some(isFlow) ? 'flow' : 'infra',
  )
  const infra = useMemo(() => buildHierarchy(graph, topology, activePath ? 'workflow' : 'infra'), [graph, topology, activePath])
  const tree = useMemo(() => !activePath && mode === 'flow' ? buildHierarchy(graph, topology, 'flow') : infra, [activePath, graph, topology, mode, infra])
  const [expansions, setExpansions] = useState<Record<string, ReadonlySet<string>>>({})
  const expansionKey = `${topology}:${mode}`
  const expanded = activePath ? tree.initialExpanded : expansions[expansionKey] ?? tree.initialExpanded
  const fitAfterLayout = useRef(false)
  const fittedPath = useRef<WorkflowPath | undefined>(undefined)
  const legendProps = useConnectionLegend()
  const { hiddenKinds, setKindVisible } = legendProps
  const stage = useRef<HTMLElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const zoomLabel = useRef<HTMLOutputElement>(null)
  const reveal = useRef<string | null>(null)
  const toggleFocus = useRef<string | null>(null)
  const layoutAnchor = useRef<string | null>(null)
  const restoreOrigin = useRef<InspectorOrigin | null>(null)
  const findOpener = (origin: InspectorOrigin | null) => {
    if (typeof origin !== 'string')
      return origin && diagramElement(stage.current, 'edge-id', origin.edge)
    const item = tree.resourceItems.get(origin) ?? tree.items.get(origin)
    const collapsed = collapsedServiceAncestor(item, expanded)
    const opener = diagramElement(stage.current, 'item', collapsed?.id ?? origin)
    if (opener) return opener
    for (let parent = collapsed?.parent ?? item?.parent; parent; parent = parent.parent) {
      const card = diagramElement(stage.current, 'item', parent.id)
      if (card) return card
    }
  }
  const inspector = useInspector((origin) => {
    const element = findOpener(origin)
    restoreOrigin.current = origin
    return element || search.current
  })
  const { open } = inspector
  const selection = inspector.pages.at(-1)
  const focusId = selection?.focusId
  const [isolatedId, setIsolatedId] = useState<string>()
  const onlyConnections = Boolean(focusId && isolatedId === focusId)
  const serviceGroup = focusId ? collapsedServiceAncestor(tree.resourceItems.get(focusId), expanded) : undefined
  const projectedFocusId = !activePath && (onlyConnections || serviceGroup)
    ? focusId
    : undefined
  const visibleKinds = useMemo(() => activePath
    ? new Set([...hiddenKinds].filter((kind) => kind !== 'connects_to' && kind !== 'triggers')) : hiddenKinds,
  [activePath, hiddenKinds])
  const context = useMemo(
    () => projectGraph(tree, mode, visibleKinds, expanded),
    [tree, mode, visibleKinds, expanded],
  )
  const current = useMemo(
    () => projectedFocusId ? projectGraph(tree, mode, hiddenKinds, expanded, projectedFocusId, onlyConnections) : context,
    [tree, mode, hiddenKinds, expanded, projectedFocusId, onlyConnections, context],
  )
  const { scene, moveCard, layoutPending, layoutFailed } = useDiagramLayout(
    tree, current, context, onlyConnections ? undefined : projectedFocusId, layoutAnchor, Boolean(activePath),
  )
  const camera = useCamera(
    stage, search, zoomLabel, scene, legendProps.legendRef, Boolean(activePath),
    activePath ? getCostWindowBounds : undefined,
  )

  useLayoutEffect(() => {
    if (!scene || scene.motion || scene.current !== current) return
    layoutAnchor.current = null
    if (activePath !== fittedPath.current || fitAfterLayout.current) {
      fitAfterLayout.current = false
      if (activePath !== fittedPath.current) reveal.current = null
      if (activePath) camera.frameWorkflow()
      else camera.fit()
    }
    fittedPath.current = activePath
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
    if (restoreOrigin.current) {
      if (document.activeElement === search.current || document.activeElement === document.body)
        findOpener(restoreOrigin.current)?.focus({ preventScroll: true })
      restoreOrigin.current = null
    }
  }, [scene, current, selection, activePath])

  const toggle = useCallback((id: string) => {
    toggleFocus.current = id
    layoutAnchor.current = id
    setExpansions((previous) => {
      const next = new Set(previous[expansionKey] ?? tree.initialExpanded)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...previous, [expansionKey]: next }
    })
  }, [expansionKey, tree.initialExpanded])

  const revealOnDiagram = (id: string, center = true) => {
    const target = tree.resourceItems.has(id) ? tree : infra
    const key = target === tree ? expansionKey : `${topology}:infra`
    const alreadyExpanded = expansions[key] ?? target.initialExpanded
    const next = new Set(alreadyExpanded)
    const itemId = revealResource(target, id, next)
    if (!itemId) return
    const item = target.items.get(itemId)!
    const group = collapsedServiceAncestor(item, next)
    if (target === tree && group && !current.items.has(itemId))
      layoutAnchor.current = group.id
    reveal.current = center ? itemId : null
    if (target !== tree) setMode('infra')
    if (next.size !== alreadyExpanded.size)
      setExpansions((previous) => ({ ...previous, [key]: next }))
    return item
  }

  const showResource: OpenResource = (id, trigger) => {
    const item = revealOnDiagram(id)
    if (!item) return
    setIsolatedId(undefined)
    const page = resourcePage(item, tree.edges)
    if (trigger) inspector.navigate(page, trigger)
    else inspector.open(page, item.id)
  }

  const sceneTree = scene?.tree
  const openItem = useCallback((id: string) => {
    const item = sceneTree?.items.get(id)
    if (sceneTree && item) {
      setIsolatedId((previous) => previous === id ? previous : undefined)
      open(resourcePage(item, sceneTree.edges), id)
    }
  }, [sceneTree, open])
  const openEdges = useCallback((edges: GraphEdge[], edgeId: string) => open({ edges, focusId }, { edge: edgeId }), [open, focusId])
  const navigateEdges: OpenRelation = (edge, trigger) => {
    const dependent = edge.kind === 'depends_on' ? revealOnDiagram(edge.from, false) : undefined
    inspector.navigate({ edges: [edge], focusId: dependent ? edge.from : focusId }, trigger)
  }

  return {
    diagramProps: {
      stage: {
        ref: stage,
        'aria-busy': layoutPending || Boolean(scene?.motion),
        'data-inspecting': Boolean(selection),
        'data-pipe-motion': legendProps.playing ? 'on' : 'off',
      },
      legend: legendProps,
      layoutFailed,
      isEmpty: graph.nodes.length === 0,
      noFlow: !activePath && graph.nodes.length > 0 && mode === 'flow' && !tree.flowIDs.size,
      canvas: scene && {
        flow: camera.flow,
        init: camera.init,
        showZoom: camera.showZoom,
        scene,
        moveCard,
        byId,
        icons,
        selection,
        workflowPath: activePath,
        workflowUsage: usage,
        toggle,
        onItem: openItem,
        onEdges: openEdges,
      },
      toolbar: {
        graph,
        icons,
        search,
        mode,
        setMode: (value: ViewMode) => {
          if (value === mode) return
          setIsolatedId(undefined)
          fitAfterLayout.current = true
          setMode(value)
        },
        dependencies: !hiddenKinds.has('depends_on'),
        setDependencies: (visible: boolean) => setKindVisible('depends_on', visible),
        topology,
        connectionScope: !activePath && focusId && tree.resourceItems.has(focusId) ? {
          checked: onlyConnections,
          change: (checked: boolean) => {
            fitAfterLayout.current = true
            setIsolatedId(checked ? focusId : undefined)
          },
        } : undefined,
        onResource: showResource,
        inspecting: Boolean(selection),
      },
      mapControls: scene && {
        graph,
        flowCount: mode === 'flow' ? tree.flowIDs.size : undefined,
        routes: scene.routes,
        zoomLabel,
        zoom: camera.zoom,
        fit: camera.fit,
      },
    },
    setTopology: (value: Topology) => {
      if (value === topology) return
      setIsolatedId(undefined)
      setTopology(value)
    },
    detailsProps: { inspector, byId, icons, onResource: showResource, onEdges: navigateEdges },
  }
}
