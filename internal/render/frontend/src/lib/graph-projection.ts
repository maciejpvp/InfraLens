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
const isFlow = (e: GraphEdge) => e.kind === 'triggers' || e.kind === 'connects_to'
const activeEdges = (graph: Graph, state: Topology) =>
  graph.edges.filter((e) => !e.state || e.state === state)

export const serviceFor = (type = ''): Service => {
  const [provider, module = ''] = type.split(':'),
    namespace = module.split('/')[0]
  if (provider !== 'aws')
    return {
      id: provider || 'unknown',
      name: provider ? provider[0].toUpperCase() + provider.slice(1) : 'Unknown',
      icon: null,
      color: '#91a5bd',
    }
  let id = namespace
  if (namespace === 'apigateway' || namespace === 'apigatewayv2') id = 'api-gateway'
  if (namespace === 'sfn') id = 'step-functions'
  if (namespace === 'cloudwatch' && /^event(Rule|Target)(:|$)/.test(module.split('/')[1] || ''))
    id = 'eventbridge'
  const service = services[id]
  return {
    id: 'aws:' + id,
    name: service?.[0] || namespace || 'AWS',
    icon: service ? id : null,
    color: service?.[1] || '#91a5bd',
  }
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
export const buildHierarchy = (graph: Graph, state: Topology = defaultTopology): Hierarchy => {
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
  const parentIDs = new Set(parents.values()),
    items = new Map<string, HierarchyItem>(),
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
  for (const n of [...graph.nodes].sort(compare)) {
    const stack = n.stack || 'No stack'
    if (!stacks.has(stack)) {
      const g = makeGroup('stack:' + stack, stack, stack)
      stacks.set(stack, g)
      items.set(g.id, g)
    }
    const root = stacks.get(stack)!
    if (n.type === 'pulumi:pulumi:Stack') {
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
  for (const parent of [...items.values()])
    if (parent.group) {
      const isSupport = (item: HierarchyItem): item is Extract<HierarchyItem, { group: false }> =>
        !item.group && !flowIDs.has(item.node.id)
      const support = parent.children.filter(isSupport)
      if (!support.length) continue
      parent.children = parent.children.filter((c) => !isSupport(c))
      const groups = new Map<string, Group>()
      for (const item of support) {
        const service = serviceFor(item.node.type)
        let group = groups.get(service.id)
        if (!group) {
          group = makeGroup('support:' + parent.id + ':' + service.id, service.name, parent.stack, null, true)
          group.service = service
          groups.set(service.id, group)
          items.set(group.id, group)
          attach(group, parent)
        }
        attach(item, group)
      }
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
  const expanded = new Set<string>()
  for (const item of items.values())
    if (
      item.group &&
      !item.support &&
      (roots.includes(item) || [...item.members].some((id) => flowIDs.has(id)))
    )
      expanded.add(item.id)
  return { roots, items, resourceItems, edges, flowIDs, initialExpanded: expanded }
}

export const revealResource = (tree: Hierarchy, id: string, expanded: Set<string>) => {
  const item = tree.resourceItems.get(id)
  if (!item) return null
  for (let parent = item.parent; parent; parent = parent.parent) expanded.add(parent.id)
  return item.id
}

export const projectGraph = (
  tree: Hierarchy,
  mode: ViewMode,
  dependencies: boolean,
  expanded: ReadonlySet<string>,
): GraphView => {
  const items = new Map<string, ProjectedItem>(),
    representatives = new Map<string, string>()
  const visit = (item: HierarchyItem) => {
    const open = item.group && expanded.has(item.id)
    const projected = {
      ...item,
      expanded: open,
      children: open && item.group ? item.children.map((c) => c.id) : [],
    }
    items.set(item.id, projected)
    if (!open) {
      for (const id of item.members) representatives.set(id, item.id)
    } else {
      if (item.node) representatives.set(item.node.id, item.id)
      if (item.group) for (const child of item.children) visit(child)
    }
  }
  for (const root of tree.roots) visit(root)
  const edges: ProjectedEdge[] = [],
    aggregates = new Map<string, ProjectedEdge>()
  for (const original of tree.edges) {
    if (
      original.kind === 'contains' ||
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
  return { items, roots: tree.roots.map((g) => g.id), edges, representatives }
}
