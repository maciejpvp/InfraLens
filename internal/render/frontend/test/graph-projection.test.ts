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
import { buildHierarchy, projectGraph, revealResource, serviceFor } from '../src/lib/graph-projection.ts'
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
  const tree = buildHierarchy(nested),
    root = tree.roots[0]
  assert.equal(root.members.size, nested.nodes.length)
  assert.equal(tree.resourceItems.get('a')?.parent?.id, 'group:nested')
  const orphan = tree.resourceItems.get('orphan')
  assert.ok(orphan?.parent)
  assert.equal(orphan.parent.name, 'Test')
  assert.ok(!tree.initialExpanded.has(orphan.parent.id))
  assert.ok(tree.initialExpanded.has('group:nested'))
  assert.equal(tree.resourceItems.get('root'), root)
  const expanded = new Set(tree.initialExpanded)
  for (const n of nested.nodes) {
    const id = revealResource(tree, n.id, expanded)
    assert.ok(id)
    assert.ok(projectGraph(tree, 'infra', true, expanded).items.has(id))
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
  const tree = buildHierarchy(graph),
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
    const v = projectGraph(tree, 'flow', true, tree.initialExpanded)
    assert.equal(v.edges.length, state === 'before' ? 1 : 0)
    assert.equal(v.representatives.size, 4)
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
    assert.ok(projectGraph(tree, 'infra', true, open).items.has(id))
  }
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

test('service groups stay inside owners and stacks, collapse by default and retain each resource once', () => {
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
    ],
    edges: [
      edge('root', 'component'),
      edge('component', 'component-role'),
      edge('bucket', 'lambda', 'triggers'),
    ],
  }
  const tree = buildHierarchy(graph),
    groups = [...tree.items.values()].filter((i) => i.group && i.support)
  assert.equal(groups.length, 4)
  const role = tree.resourceItems.get('role'),
    policy = tree.resourceItems.get('policy')
  assert.ok(role?.parent && policy?.parent)
  assert.equal(role.parent, policy.parent)
  assert.equal(role.parent.name, 'IAM')
  assert.notEqual(role.parent, tree.resourceItems.get('other-role')?.parent)
  assert.equal(tree.resourceItems.get('component-role')?.parent?.parent?.id, 'group:component')
  assert.equal(tree.resourceItems.get('opensearch-on-ec2')?.parent?.name, 'EC2')
  for (const id of ['bucket', 'lambda']) {
    const parent = tree.resourceItems.get(id)?.parent
    assert.ok(parent && !parent.support)
  }
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
