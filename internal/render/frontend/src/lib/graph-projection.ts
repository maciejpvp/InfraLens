import type {
  Graph,
  GraphEdge,
  GraphView,
  Group,
  Hierarchy,
  HierarchyItem,
  ProjectedEdge,
  ProjectedItem,
  Resource,
  Service,
  Topology,
  ViewMode,
} from './graph.types.ts'

import { defaultTopology, services } from './layout.config.ts'

const compare = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
export const isFlow = (e: GraphEdge) => e.kind === 'triggers' || e.kind === 'connects_to'
export const activeEdges = (graph: Graph, state: Topology) =>
  graph.edges.filter((e) => !e.state || e.state === state)

export const isAppSyncAPI = (node?: Resource | null) =>
  node?.type === 'AWS::AppSync::GraphQLApi' || node?.type === 'aws:appsync/graphQLApi:GraphQLApi'

export const serviceFor = ({ provider, service: id = '' }: Pick<Resource, 'provider' | 'service'> = {}): Service => {
  if (provider !== 'aws')
    return {
      id: provider || 'unknown',
      name: provider ? provider[0].toUpperCase() + provider.slice(1) : 'Unknown',
      icon: null,
      color: '#91a5bd',
    }
  const service = services[id]
  return {
    id: 'aws:' + id,
    name: service?.[0] || id || 'AWS',
    icon: service && id !== 'appsync' ? id : null,
    color: service?.[1] || '#91a5bd',
  }
}

export const groupDependenciesByService = (edges: GraphEdge[], byId: ReadonlyMap<string, Resource>) => {
  const groups = new Map<string, { key: string; from: Service; to: Service; edges: GraphEdge[] }>()
  for (const edge of edges) {
    const from = serviceFor(byId.get(edge.from))
    const to = serviceFor(byId.get(edge.to))
    const key = JSON.stringify([from.id, to.id])
    const group = groups.get(key)
    if (group) group.edges.push(edge)
    else groups.set(key, { key, from, to, edges: [edge] })
  }
  return [...groups.values()].sort((a, b) => a.from.name.localeCompare(b.from.name) ||
    a.to.name.localeCompare(b.to.name) || a.key.localeCompare(b.key))
}

// Descriptions belong to evidence; grouping must not discard individual routes or filters.
type DescribedEdge = { evidence?: GraphEdge['evidence']; originals?: { evidence?: GraphEdge['evidence'] }[] }

export const flowDescriptions = (edges: readonly DescribedEdge[]) => {
  const descriptions = new Map<string, { label: string; details: string }>()
  for (const edge of edges)
    for (const original of edge.originals || [edge])
      for (const proof of original.evidence || []) {
        if (proof.label || proof.details) {
          const value = { label: proof.label || 'Details', details: proof.details || '' }
          descriptions.set(JSON.stringify(value), value)
        }
      }
  return [...descriptions.values()].sort(
    (a, b) => a.label.localeCompare(b.label) || a.details.localeCompare(b.details),
  )
}
export const edgeCaption = (edge: DescribedEdge) => {
  const descriptions = flowDescriptions([edge]),
    label = descriptions[0]?.label || ''
  const text = Array.from(label),
    short = text.length > 40 ? text.slice(0, 39).join('') + '…' : label
  const count = edge.originals?.length || 1
  return [
    short + (descriptions.length > 1 ? ' +' + (descriptions.length - 1) : ''),
    count > 1 ? '×' + count : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

// Groups are a view of ownership, not new infrastructure resources.
export const buildHierarchy = (
  graph: Graph,
  state: Topology = defaultTopology,
  mode: ViewMode = 'infra',
): Hierarchy => {
  const edges = activeEdges(graph, state),
    nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const flowIDs = new Set(edges.filter(isFlow).flatMap((e) => [e.from, e.to]))
  const parents = new Map<string, string>()
  for (const e of edges)
    if (
      e.kind === 'contains' &&
      nodes.has(e.from) &&
      nodes.has(e.to) &&
      nodes.get(e.from)?.stack === nodes.get(e.to)?.stack
    )
      parents.set(e.to, e.from)
  if (mode === 'infra') {
    for (const e of edges) {
      const node = nodes.get(e.from), api = nodes.get(e.to)
      if (e.kind === 'depends_on' && node?.service === 'appsync' && !isAppSyncAPI(node) &&
        isAppSyncAPI(api) && node.stack === api?.stack &&
        e.evidence.some((proof) => proof.source === 'appsync_api')) {
        parents.set(e.from, e.to)
      }
    }
  }
  const items = new Map<string, HierarchyItem>(),
    resourceItems = new Map<string, HierarchyItem>(),
    stacks = new Map<string, Group>()
  const makeGroup = (
    id: string,
    name: string,
    stack: string,
    node: Resource | null = null,
    support = false,
  ): Group => ({
    id,
    name,
    stack,
    node,
    group: true,
    support,
    children: [],
    members: new Set(node ? [node.id] : []),
    parent: null,
  })
  const included = new Set(flowIDs)
  if (mode === 'flow') {
    for (const id of flowIDs) {
      for (let ancestor = parents.get(id); ancestor && !included.has(ancestor); ancestor = parents.get(ancestor))
        included.add(ancestor)
    }
  }
  const parentIDs = new Set<string>()
  for (const [child, parent] of parents) {
    if (mode === 'infra' || !isAppSyncAPI(nodes.get(parent)) || included.has(child))
      parentIDs.add(parent)
  }
  for (const n of [...graph.nodes].sort(compare)) {
    if (mode === 'flow' && !included.has(n.id)) continue
    const stack = n.stack || 'No stack'
    if (!stacks.has(stack)) {
      const g = makeGroup('stack:' + stack, stack, stack)
      stacks.set(stack, g)
      items.set(g.id, g)
    }
    const root = stacks.get(stack)!
    if (n.stackRoot) {
      root.node = n
      root.members.add(n.id)
      resourceItems.set(n.id, root)
      continue
    }
    const item: HierarchyItem = parentIDs.has(n.id)
      ? makeGroup('group:' + n.id, n.name, stack, n)
      : { id: n.id, name: n.name, stack, node: n, group: false, members: new Set([n.id]), parent: null }
    items.set(item.id, item)
    resourceItems.set(n.id, item)
  }
  const attach = (item: HierarchyItem, parent: Group) => {
    item.parent = parent
    parent.children.push(item)
  }
  for (const item of [...items.values()]) {
    if (!item.node || stacks.get(item.stack) === item) continue
    const parentID = parents.get(item.node.id)
    const owner = parentID ? resourceItems.get(parentID) : undefined
    const stack = stacks.get(item.stack)!
    const parent = owner?.group && owner !== item ? owner : stack
    // Tolerate incomplete/malformed ownership without creating a recursive tree.
    const seen = new Set([item.node.id])
    let ancestor = parents.get(item.node.id),
      cycle = false
    while (ancestor) {
      if (seen.has(ancestor)) {
        cycle = true
        break
      }
      seen.add(ancestor)
      ancestor = parents.get(ancestor)
    }
    attach(item, cycle ? stack : parent)
  }
  for (const parent of [...items.values()]) {
    if (!parent.group) continue
    const services = new Map<string, { service: Service; leaves: HierarchyItem[] }>()
    for (const item of parent.children) {
      if (item.group || isAppSyncAPI(item.node) || (mode === 'flow' && !item.node.service) ||
        (isAppSyncAPI(parent.node) && item.node.service === 'appsync')) continue
      const service = serviceFor(item.node)
      const bucket = services.get(service.id)
      if (bucket) bucket.leaves.push(item)
      else services.set(service.id, { service, leaves: [item] })
    }
    for (const { service, leaves } of services.values()) {
      if (mode === 'flow' && leaves.length < 2) continue
      const group = makeGroup('service:' + parent.id + ':' + service.id, service.name, parent.stack, null, true)
      group.service = service
      items.set(group.id, group)
      attach(group, parent)
      for (const item of leaves) attach(item, group)
    }
    parent.children = parent.children.filter((child) => child.parent === parent)
  }
  const collect = (item: HierarchyItem): Set<string> => {
    if (item.group) {
      item.children.sort(compare)
      for (const child of item.children) for (const id of collect(child)) item.members.add(id)
    }
    return item.members
  }
  const roots = [...stacks.values()].sort(compare)
  for (const root of roots) collect(root)
  const expanded = new Set(
    mode === 'flow' ? [...items.values()].filter((item) => item.group && !item.service).map((item) => item.id) : roots.map((root) => root.id),
  )
  return { roots, items, resourceItems, edges, flowIDs, initialExpanded: expanded }
}

export const revealResource = (tree: Hierarchy, id: string, expanded: Set<string>) => {
  const item = tree.resourceItems.get(id)
  if (!item) return null
  const first = !item.group && item.parent?.service ? item.parent.parent : item.parent
  for (let parent = first; parent; parent = parent.parent) expanded.add(parent.id)
  return item.id
}

export const projectGraph = (
  tree: Hierarchy,
  mode: ViewMode,
  dependencies: boolean,
  expanded: ReadonlySet<string>,
  resourceId?: string,
  onlyConnections = false,
): GraphView => {
  const items = new Map<string, ProjectedItem>(),
    representatives = new Map<string, string>()
  const focus = resourceId ? tree.resourceItems.get(resourceId) : undefined
  const restrict = onlyConnections && Boolean(focus)
  const collapsedService = !focus?.group && focus?.parent?.service && !expanded.has(focus.parent.id)
    ? focus.parent
    : undefined
  const visit = (item: HierarchyItem, parent = item.parent) => {
    const open = item.group && expanded.has(item.id)
    const members = item === collapsedService
      ? new Set([...item.members].filter((id) => id !== resourceId))
      : item.members
    if (!members.size) return
    const projected = {
      ...item,
      parent,
      members,
      expanded: open,
      children: [] as string[],
    }
    items.set(item.id, projected)
    if (!open) {
      for (const id of members) representatives.set(id, item.id)
    } else {
      if (item.node) representatives.set(item.node.id, item.id)
      for (const child of item.children) {
        visit(child)
        if (items.has(child.id)) projected.children.push(child.id)
        if (child === collapsedService && focus) {
          visit(focus, item)
          projected.children.push(focus.id)
        }
      }
    }
  }
  for (const root of tree.roots) visit(root)
  const edges: ProjectedEdge[] = [],
    aggregates = new Map<string, ProjectedEdge>()
  for (const original of tree.edges) {
    if (
      original.kind === 'contains' ||
      (restrict && original.from !== resourceId && original.to !== resourceId) ||
      (mode === 'flow' ? !isFlow(original) : original.kind === 'depends_on' && !dependencies)
    )
      continue
    const from = representatives.get(original.from),
      to = representatives.get(original.to)
    if (!from || !to || from === to) continue
    const key = JSON.stringify([from, to, original.kind, original.state || ''])
    if (!aggregates.has(key)) {
      const edge = { from, to, kind: original.kind, state: original.state, originals: [] }
      aggregates.set(key, edge)
      edges.push(edge)
    }
    aggregates.get(key)!.originals.push(original)
  }
  edges.sort((a, b) =>
    JSON.stringify([a.from, a.to, a.kind, a.state]).localeCompare(
      JSON.stringify([b.from, b.to, b.kind, b.state]),
    ),
  )
  if (restrict && resourceId) {
    const keep = new Set<string>()
    const retain = (id?: string) => {
      for (let item = id ? items.get(id) : undefined; item && !keep.has(item.id); item = item.parent ? items.get(item.parent.id) : undefined)
        keep.add(item.id)
    }
    retain(representatives.get(resourceId))
    for (const edge of edges) {
      retain(edge.from)
      retain(edge.to)
    }
    for (const [id, item] of items) {
      if (keep.has(id)) item.children = item.children.filter((child) => keep.has(child))
      else items.delete(id)
    }
    for (const [id, representative] of representatives)
      if (!keep.has(representative)) representatives.delete(id)
  }
  return { items, roots: tree.roots.map((g) => g.id).filter((id) => items.has(id)), edges, representatives }
}
