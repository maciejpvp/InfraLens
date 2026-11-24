import type { EdgeKind, Graph, GraphEdge, GraphView, Hierarchy } from '../src/lib/graph.types.ts'
import type { DiagramLayout, Point, Position } from '../src/features/diagram/layout/layout-model.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutDiagram } from '../src/features/diagram/layout/elk-layout.ts'
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
