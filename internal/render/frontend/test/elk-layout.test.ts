import type { EdgeKind, Graph, GraphEdge, GraphView, Hierarchy } from '../src/lib/graph.types.ts'
import type { DiagramLayout, Point, Position } from '../src/features/diagram/layout/layout-model.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutDiagram } from '../src/features/diagram/layout/elk-layout.ts'
import { roundedRoute } from '../src/features/diagram/layout/layout-model.ts'
import { buildHierarchy, projectGraph } from '../src/lib/graph-projection.ts'
import { GROUP_HEADER_HEIGHT } from '../src/features/diagram/layout/dimensions.ts'

const node = (id: string, stack = 'app/dev') => ({ id, name: id, type: 'test:resource:Resource', stack })
const edge = (from: string, to: string, kind: EdgeKind = 'triggers', label?: string): GraphEdge => ({
  from,
  to,
  kind,
  evidence: [{ source: 'test', label }],
})
const measureText = (text: string) => [...text].length * 7

const createView = (
  graph: Graph,
  expand: (tree: Hierarchy) => Set<string> = (tree) => new Set(tree.items.keys()),
) => {
  const tree = buildHierarchy(graph)
  return projectGraph(tree, 'infra', new Set(), expand(tree))
}

const crosses = (a: Point, b: Point, box: Position) => {
  const right = box.x + box.width
  const bottom = box.y + box.height
  if (a.y === b.y) {
    return a.y > box.y && a.y < bottom && Math.min(a.x, b.x) < right && Math.max(a.x, b.x) > box.x
  }
  assert.equal(a.x, b.x, 'Route contains a diagonal segment')
  return a.x > box.x && a.x < right && Math.min(a.y, b.y) < bottom && Math.max(a.y, b.y) > box.y
}

const assertClearRoutes = (view: GraphView, { layout, routes }: DiagramLayout) => {
  const obstacles = [...layout.positions].map(([id, box]) =>
    view.items.get(id)!.expanded ? { ...box, height: GROUP_HEADER_HEIGHT } : box,
  )
  assert.equal(routes.length, view.edges.length)
  for (const route of routes) {
    assert.ok(route, 'Missing route')
    for (const [index, end] of route.points.slice(1).entries()) {
      assert.ok(
        obstacles.every((box) => !crosses(route.points[index], end, box)),
        'Route crosses a card or header',
      )
    }
  }
}

test('compound routes use the same coordinates as cards and avoid their interiors', async () => {
  const graph = {
    nodes: [
      node('component'),
      node('nested'),
      node('source'),
      node('middle'),
      node('local'),
      node('target', 'other/dev'),
    ],
    edges: [
      edge('component', 'nested', 'contains'),
      edge('nested', 'source', 'contains'),
      edge('component', 'middle', 'contains'),
      edge('nested', 'local', 'contains'),
      edge('source', 'local', 'triggers', 'Within a group'),
      edge('source', 'middle', 'triggers', 'Between nested groups'),
      edge('middle', 'target', 'connects_to', 'Across stacks'),
      edge('target', 'source', 'depends_on'),
    ],
  }
  const expanded = createView(graph)
  const collapsed = createView(graph, (tree) => new Set(tree.roots.map((item) => item.id)))
  for (const view of [expanded, collapsed]) {
    const result = await layoutDiagram(view, measureText)
    assert.equal(result.layout.positions.size, view.items.size)
    for (const [id, box] of result.layout.positions) {
      const parentID = view.items.get(id)?.parent?.id
      const parent = parentID ? result.layout.positions.get(parentID) : undefined
      if (!parent) continue
      assert.ok(box.x >= parent.x && box.y >= parent.y + GROUP_HEADER_HEIGHT)
      assert.ok(
        box.x + box.width <= parent.x + parent.width && box.y + box.height <= parent.y + parent.height,
      )
    }
    assertClearRoutes(view, result)
  }
})

test('parallel connections have separate ports, routes and labels', async () => {
  const view = createView({
    nodes: [node('source'), node('target')],
    edges: (['triggers', 'connects_to', 'depends_on'] as const).map((kind) =>
      edge('source', 'target', kind, kind),
    ),
  })
  const result = await layoutDiagram(view, measureText)
  assertClearRoutes(view, result)
  const routes = result.routes.filter((route) => route !== null)
  assert.equal(new Set(routes.map((route) => JSON.stringify(route.points[0]))).size, 3)
  assert.equal(new Set(routes.map((route) => JSON.stringify(route.points.at(-1)))).size, 3)
  assert.equal(new Set(routes.map((route) => route.d)).size, 3)
  assert.deepEqual(
    new Set(routes.map((route) => route.label?.text)),
    new Set(['triggers', 'connects_to', 'depends_on']),
  )
})

test('empty graph has no positions or routes', async () => {
  const view = createView({ nodes: [], edges: [] })
  const { layout, routes } = await layoutDiagram(view, measureText)
  assert.equal(layout.positions.size, 0)
  assert.deepEqual(routes, [])
})

test('orders compatible Lambda groups on opposite sides of storage in both report views', async () => {
  const aws = (id: string, service: string) => ({ ...node(id), provider: 'aws', service })
  for (const storage of ['s3', 'dynamodb']) {
    const writers = ['w1', 'w2', 'w3', 'w4'], readers = ['r1', 'r2', 'r3', 'r4']
    const graph: Graph = {
      nodes: [aws('api', 'api-gateway'), aws('store', storage), aws('role', 'iam'),
        ...[...writers, ...readers, 'switch'].map((id) => aws(id, 'lambda'))],
      edges: [
        ...writers.flatMap((id) => [edge('api', id), edge(id, 'store', 'connects_to')]),
        ...readers.map((id) => edge('store', id)),
        { ...edge('api', 'switch'), state: 'before' },
        { ...edge('switch', 'store', 'connects_to'), state: 'before' },
        { ...edge('store', 'switch'), state: 'after' },
        edge('store', 'api', 'depends_on'),
        edge('w1', 'role', 'depends_on'),
      ],
    }
    for (const state of ['before', 'after'] as const) {
      for (const mode of ['flow', 'infra'] as const) {
        const tree = buildHierarchy(graph, state, mode)
        const view = projectGraph(tree, mode, new Set(), tree.initialExpanded)
        const result = await layoutDiagram(view, measureText)
        const writer = view.representatives.get('w1')!, reader = view.representatives.get('r1')!
        assert.ok(view.items.get(writer)?.group && view.items.get(reader)?.group)
        assert.equal(view.representatives.get('switch'), state === 'before' ? writer : reader)
        const x = (id: string) => result.layout.positions.get(id)!.x
        assert.ok(x('api') < x(writer) && x(writer) < x('store') && x('store') < x(reader))
        assertClearRoutes(view, result)
        if (mode === 'infra') {
          const reverse = view.edges.findIndex(({ from, to }) => from === 'store' && to === 'api')
          const route = result.routes[reverse]!
          assert.ok(route.points[0].x >= x('store'))
          assert.ok(route.points.at(-1)!.x < x(writer))
          assert.ok(x('role') < x('store'))
        }
      }
    }
  }
})

test('real flow cycles retain all edges and keep participating cards separate', async () => {
  const ring = ['a', 'b', 'c', 'd']
  const nodes = ['source', ...ring, 'sink'].map((id) => ({ ...node(id), provider: 'aws', service: 'lambda' }))
  const graph = { nodes, edges: [
    edge('source', 'a'),
    ...ring.map((id, i) => edge(id, ring[(i + 1) % ring.length])),
    edge('d', 'sink'),
  ] }
  const view = createView(graph, (tree) => tree.initialExpanded)
  for (const id of ring) assert.equal(view.representatives.get(id), id)
  assert.equal(view.edges.length, graph.edges.length)
  const result = await layoutDiagram(view, measureText)
  assertClearRoutes(view, result)
  const x = (id: string) => result.layout.positions.get(id)!.x
  assert.ok(x('source') < x('a') && x('d') < x('sink'))
})

test('routes a dependency directly between two cards in the same column', async () => {
  const view = createView({
    nodes: ['source', 'a', 'b'].map((id) => node(id)),
    edges: [edge('source', 'a'), edge('source', 'b'), edge('a', 'b', 'depends_on')],
  })
  const result = await layoutDiagram(view, measureText)
  assertClearRoutes(view, result)
  const route = result.routes[view.edges.findIndex(({ kind }) => kind === 'depends_on')]!
  const a = result.layout.positions.get('a')!, b = result.layout.positions.get('b')!
  assert.equal(a.x, b.x)
  assert.deepEqual(route.points, [
    { x: a.x + a.width / 2, y: a.y + a.height },
    { x: b.x + b.width / 2, y: b.y },
  ])
})

test('rounds turns without changing endpoints or shortening the straight arrow lead below eight units', () => {
  const points = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 40, y: 10 }]
  const d = 'M0 0 H30 V10 H40'
  assert.equal(roundedRoute({ points, d }), 'M0 0 L25 0 Q30 0 30 5 L30 8 Q30 10 32 10 L40 10')
})
