import type {
  EdgeKind,
  GraphEdge,
  Hierarchy,
  HierarchyItem,
  Resource,
  Topology,
} from '../src/lib/graph.types.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHierarchy, groupDependenciesByService, projectGraph, revealResource, serviceFor } from '../src/lib/graph-projection.ts'
const node = (id: string, type = 'test', stack = 'stack'): Resource => ({
  id,
  name: id,
  type,
  provider: 'test',
  stack,
  change: 'create',
})
const edge = (from: string, to: string, kind: EdgeKind = 'contains', state?: Topology): GraphEdge => ({
  from,
  to,
  kind,
  state,
  evidence: [{ source: 'test', property: from + '.' + to }],
})
const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id))
const edges = [
  edge('a', 'b', 'triggers'),
  edge('a', 'c', 'triggers'),
  edge('b', 'd', 'triggers'),
  edge('c', 'd', 'triggers'),
  edge('d', 'a', 'connects_to'),
]
const nested = {
  nodes: [{ ...node('root'), stackRoot: true }, node('component'), node('nested'), ...nodes, node('orphan')],
  edges: [
    edge('root', 'component'),
    edge('component', 'nested'),
    edge('nested', 'a'),
    edge('nested', 'b'),
    edge('component', 'c'),
    edge('missing', 'orphan'),
    ...edges,
  ],
}
test('stack and component hierarchy retains every resource, missing parents and supporting branches', () => {
  const tree = buildHierarchy(nested, 'after', 'flow'),
    root = tree.roots[0]
  assert.equal(root.members.size, nested.nodes.length - 1)
  assert.equal(tree.resourceItems.get('a')?.parent?.id, 'group:nested')
  assert.ok(!tree.resourceItems.has('orphan'))
  const infra = buildHierarchy(nested)
  assert.equal(infra.resourceItems.get('orphan')?.parent?.name, 'Test')
  assert.ok(tree.initialExpanded.has('group:nested'))
  assert.equal(tree.resourceItems.get('root'), root)
  const expanded = new Set(infra.initialExpanded)
  for (const n of nested.nodes) {
    const id = revealResource(infra, n.id, expanded)
    assert.ok(id)
    assert.ok(projectGraph(infra, 'infra', true, expanded, n.id).items.has(id))
  }
})
test('collapsed connections aggregate by kind and retain each original edge and evidence', () => {
  const graph = {
    nodes: [node('g'), node('a'), node('b'), node('target')],
    edges: [
      edge('g', 'a'),
      edge('g', 'b'),
      edge('a', 'target', 'triggers'),
      edge('b', 'target', 'triggers'),
      edge('a', 'b', 'connects_to'),
      edge('a', 'target', 'connects_to'),
    ],
  }
  const tree = buildHierarchy(graph, 'after', 'flow'),
    view = projectGraph(tree, 'flow', true, new Set(tree.roots.map((r) => r.id)))
  assert.equal(view.edges.length, 2)
  const aggregate = view.edges.find((e) => e.kind === 'triggers')
  assert.ok(aggregate)
  assert.equal(aggregate.from, 'group:g')
  assert.equal(aggregate.originals.length, 2)
  assert.equal(aggregate.originals[0], graph.edges[2])
  assert.equal(aggregate.originals[1].evidence[0].property, 'b.target')
  assert.equal(view.edges.flatMap((e) => e.originals).length, 3)
})
test('active topology controls both parentage and connections; filters do not lose resources', () => {
  const graph = {
    nodes: [node('old'), node('new'), node('a'), node('b')],
    edges: [
      edge('old', 'a', 'contains', 'before'),
      edge('new', 'a', 'contains', 'after'),
      edge('a', 'b', 'triggers', 'before'),
      edge('b', 'a', 'depends_on'),
    ],
  }
  for (const state of ['before', 'after'] as const) {
    const tree = buildHierarchy(graph, state)
    let parent = tree.resourceItems.get('a')?.parent
    if (parent?.support) parent = parent.parent
    assert.equal(parent?.id, 'group:' + (state === 'before' ? 'old' : 'new'))
    const flow = buildHierarchy(graph, state, 'flow')
    const v = projectGraph(flow, 'flow', true, flow.initialExpanded)
    assert.equal(v.edges.length, state === 'before' ? 1 : 0)
    assert.equal(v.representatives.size, state === 'before' ? 3 : 0)
    assert.equal(projectGraph(tree, 'infra', true, tree.initialExpanded).representatives.size, 4)
    assert.equal(
      projectGraph(tree, 'infra', false, tree.initialExpanded).edges.some((e) => e.kind === 'depends_on'),
      false,
    )
  }
})
test('cyclic ownership, cross-stack and unknown parents cannot hide a resource', () => {
  const graph = {
    nodes: [node('a'), node('b'), node('c', 'test', 'other'), node('d')],
    edges: [edge('a', 'b'), edge('b', 'a'), edge('a', 'c'), edge('unknown', 'd')],
  }
  const tree = buildHierarchy(graph)
  assert.equal(
    tree.roots.reduce((n, g) => n + g.members.size, 0),
    4,
  )
  for (const n of graph.nodes) {
    const open = new Set(tree.initialExpanded)
    const id = revealResource(tree, n.id, open)
    assert.ok(id)
    assert.ok(projectGraph(tree, 'infra', true, open, n.id).items.has(id))
  }
})

test('reveals one Lambda while keeping sibling edges aggregated and isolates direct connections', () => {
  const aws = (id: string, service: string) => ({ ...node(id), provider: 'aws', service })
  const graph = {
    nodes: [aws('picked', 'lambda'), aws('sibling', 'lambda'), aws('lonely', 'lambda'), aws('table', 'dynamodb'),
      aws('queue', 'sqs'), aws('unrelated', 's3')],
    edges: [
      edge('picked', 'table', 'depends_on'),
      edge('sibling', 'table', 'depends_on'),
      edge('queue', 'picked', 'triggers'),
      edge('unrelated', 'table', 'depends_on'),
    ],
  }
  const tree = buildHierarchy(graph)
  const service = tree.resourceItems.get('picked')!.parent!
  const expanded = new Set(tree.initialExpanded)
  revealResource(tree, 'picked', expanded)
  assert.ok(!expanded.has(service.id))
  const context = projectGraph(tree, 'infra', true, expanded, 'picked')
  assert.equal(context.items.get('picked')?.parent?.id, service.parent?.id)
  assert.equal(context.items.get(service.id)?.expanded, false)
  assert.deepEqual([...context.items.get(service.id)!.members].sort(), ['lonely', 'sibling'])
  assert.equal(context.representatives.get('picked'), 'picked')
  assert.equal(context.representatives.get('sibling'), service.id)
  assert.deepEqual(context.edges.find((e) => e.from === service.id)?.originals, [graph.edges[1]])

  const isolated = projectGraph(tree, 'infra', true, expanded, 'picked', true)
  assert.equal(isolated.items.size, 4)
  assert.ok(!isolated.items.has(service.id))
  assert.deepEqual(isolated.edges.flatMap(({ originals }) => originals).map(({ from, to }) => [from, to]).sort(),
    [['picked', 'table'], ['queue', 'picked']])
  assert.equal(projectGraph(tree, 'infra', false, expanded, 'picked', true).edges.length, 1)
  const alone = projectGraph(tree, 'infra', true, expanded, 'lonely', true)
  assert.equal(alone.items.size, 2)
  assert.equal(alone.edges.length, 0)
  assert.ok(alone.items.has('lonely'))

  assert.ok(!projectGraph(tree, 'infra', true, expanded).items.has('picked'))
  expanded.add(service.id)
  const full = projectGraph(tree, 'infra', true, expanded, 'picked')
  assert.equal(full.items.get('picked')?.parent?.id, service.id)
  assert.equal(full.items.get(service.id)?.children.length, 3)
})

test('groups deployment dependencies by directional service pair', () => {
  const byId = new Map([
    { ...node('first'), provider: 'aws', service: 'lambda' },
    { ...node('second'), provider: 'aws', service: 'lambda' },
    { ...node('table'), provider: 'aws', service: 'dynamodb' },
  ].map((resource) => [resource.id, resource]))
  const edges = [
    edge('first', 'table', 'depends_on'),
    edge('second', 'table', 'depends_on'),
    edge('table', 'first', 'depends_on'),
  ]
  const groups = groupDependenciesByService(edges, byId)
  assert.deepEqual(groups.map(({ from, to, edges }) => [from.icon, to.icon, edges.length]), [
    ['dynamodb', 'lambda', 1], ['lambda', 'dynamodb', 2],
  ])
  assert.deepEqual(groups[1].edges, edges.slice(0, 2))
})
test('flow captions preserve distinct routes and filters while deduplicating presentation', async () => {
  const { flowDescriptions, edgeCaption } = await import('../src/lib/graph-projection.ts')
  const a = {
    evidence: [
      { source: 'test', label: 'GET /search', details: 'auth: NONE', resource: 'a' },
      { source: 'test', label: 'GET /search', details: 'auth: NONE', resource: 'b' },
      { source: 'test', label: 'GET /search', details: 'auth: JWT' },
      { source: 'test', label: 'POST /search' },
    ],
  }
  const aggregate = { originals: [a, a] }
  assert.equal(flowDescriptions([aggregate]).length, 3)
  assert.equal(edgeCaption(aggregate), 'GET /search +2 · ×2')
  assert.equal(edgeCaption({ evidence: [{ source: 'test' }] }), '')
  assert.equal(edgeCaption({ originals: [{ evidence: [] }, { evidence: [] }] }), '×2')
  assert.equal(Array.from(edgeCaption({ evidence: [{ source: 'test', label: '界'.repeat(50) }] })).length, 40)
  assert.deepEqual(flowDescriptions([a]), flowDescriptions([{ evidence: [...a.evidence].reverse() }]))
})

test('service classification uses explicit provider and service metadata', () => {
  const api = serviceFor({ provider: 'aws', service: 'api-gateway' })
  assert.equal(api.name, 'API Gateway')
  assert.equal(api.icon, 'api-gateway')
  assert.equal(serviceFor({ provider: 'aws', service: 'other' }).name, 'other')
  assert.equal(serviceFor({ provider: 'random' }).name, 'Random')
  assert.equal(serviceFor().name, 'Unknown')
})

test('infrastructure groups each service once per owner and stack; flow retains only its endpoints', () => {
  const graph = {
    nodes: [
      { ...node('root'), stackRoot: true },
      node('component', 'pkg:index:Component'),
      { ...node('role'), provider: 'aws', service: 'iam' },
      { ...node('policy'), provider: 'aws', service: 'iam' },
      { ...node('bucket'), provider: 'aws', service: 's3' },
      { ...node('opensearch-on-ec2'), provider: 'aws', service: 'ec2' },
      { ...node('other-role', 'Resource', 'other'), provider: 'aws', service: 'iam' },
      { ...node('component-role'), provider: 'aws', service: 'iam' },
      { ...node('lambda'), provider: 'aws', service: 'lambda' },
      { ...node('second-lambda'), provider: 'aws', service: 'lambda' },
      { ...node('permission'), provider: 'aws', service: 'lambda' },
      { ...node('second-permission'), provider: 'aws', service: 'lambda' },
      { ...node('same-name-role'), name: 'lambda', provider: 'aws', service: 'iam' },
    ],
    edges: [
      edge('root', 'component'),
      edge('component', 'component-role'),
      edge('bucket', 'lambda', 'triggers'),
      edge('second-lambda', 'opensearch-on-ec2', 'connects_to'),
    ],
  }
  const tree = buildHierarchy(graph),
    groups = [...tree.items.values()].filter((i) => i.group && i.support)
  assert.equal(groups.length, 6)
  const role = tree.resourceItems.get('role'),
    policy = tree.resourceItems.get('policy')
  assert.ok(role?.parent && policy?.parent)
  assert.equal(role.parent, policy.parent)
  assert.equal(role.parent.name, 'IAM')
  assert.notEqual(role.parent, tree.resourceItems.get('other-role')?.parent)
  assert.equal(tree.resourceItems.get('component-role')?.parent?.parent?.id, 'group:component')
  assert.equal(tree.resourceItems.get('opensearch-on-ec2')?.parent?.name, 'EC2')
  const lambda = tree.resourceItems.get('lambda')?.parent
  assert.deepEqual([...lambda!.members].sort(), ['lambda', 'permission', 'second-lambda', 'second-permission'])
  assert.equal(role.parent, tree.resourceItems.get('same-name-role')?.parent)
  const flow = buildHierarchy(graph, 'after', 'flow')
  const visible = projectGraph(flow, 'flow', true, flow.initialExpanded)
  assert.deepEqual([...visible.representatives.keys()].sort(), ['bucket', 'lambda', 'opensearch-on-ec2', 'second-lambda'])
  assert.equal(visible.edges.length, 2)
  assert.equal([...visible.items.values()].some((item) => item.service), false)
  for (const group of groups) {
    assert.ok(group.group && group.children.length)
    assert.ok(!tree.initialExpanded.has(group.id))
  }
  const resources: string[] = []
  const visit = (item: HierarchyItem) => {
    if (item.node) resources.push(item.node.id)
    if (item.group) for (const child of item.children) visit(child)
  }
  for (const root of tree.roots) visit(root)
  assert.deepEqual(resources.sort(), graph.nodes.map((n) => n.id).sort())
  const reverse = buildHierarchy({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() })
  const structure = (t: Hierarchy) =>
    [...t.items.values()]
      .filter((i) => i.group)
      .map((i) => [i.id, i.children.map((c) => c.id)])
      .sort()
  assert.deepEqual(structure(tree), structure(reverse))
})
