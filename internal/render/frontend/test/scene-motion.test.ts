import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildHierarchy, projectGraph } from '../src/lib/graph-projection.ts'
import { layoutDiagram } from '../src/lib/elk-layout.ts'
import { canPlace, motionFrame, moveCard, placementKey, positionScene, revealInPlace, translateScene } from '../src/lib/scene-motion.ts'
import type { Graph, Scene } from '../src/lib/graph.types.ts'

const graph: Graph = {
  nodes: ['a', 'b', 'permission', 'log', 'version'].map((id) => ({
    id, name: id, type: 'test:resource:Resource', stack: 'app/dev',
    provider: id === 'a' ? 'one' : 'two',
  })),
  edges: [{ from: 'a', to: 'b', kind: 'triggers', evidence: [{ source: 'test', label: 'event' }] }],
}
const measure = (text: string) => text.length * 7
const tree = buildHierarchy(graph)
const scene = async (expanded: Set<string>, resourceId?: string): Promise<Scene> => {
  const current = projectGraph(tree, 'infra', new Set(), expanded, resourceId)
  return { ...await layoutDiagram(current, measure), current, tree }
}

test('a revealed resource slides out from its collapsed service card', async () => {
  const closed = await scene(tree.initialExpanded)
  const view = projectGraph(tree, 'infra', new Set(), tree.initialExpanded, 'b')
  const revealed = revealInPlace(closed, view, 'b', measure)!
  const group = tree.resourceItems.get('b')!.parent!.id
  const groupBox = closed.layout.positions.get(group)!
  for (const [id, position] of closed.layout.positions)
    assert.deepEqual(revealed.layout.positions.get(id), position)
  assert.ok(revealed.routes.every(Boolean))
  const firstFrame = motionFrame(closed, revealed, 0)
  const childBox = firstFrame.layout.positions.get('b')!
  assert.equal(childBox.x, groupBox.x)
  assert.equal(childBox.y, groupBox.y)
  assert.equal(firstFrame.motion?.fading.get('b'), 0)
  const midway = motionFrame(closed, revealed, 0.5)
  for (const [id, position] of closed.layout.positions)
    assert.deepEqual(midway.layout.positions.get(id), position)
  assert.ok(!revealed.current.items.get(group)?.expanded)
  assert.ok(!firstFrame.current.items.has('permission'))
})

test('the same snapshot moves the group frame, entering children and both ends of routes', async () => {
  const group = tree.resourceItems.get('b')!.parent!.id
  const closed = await scene(tree.initialExpanded)
  const open = await scene(new Set([...tree.initialExpanded, group]))
  const before = closed.layout.positions.get(group)!
  const after = open.layout.positions.get(group)!
  const target = translateScene(open, { x: before.x - after.x, y: before.y - after.y })
  const midway = motionFrame(closed, target, 0.5)
  const box = midway.layout.positions.get(group)!
  assert.equal(box.x, before.x)
  assert.equal(box.y, before.y)
  assert.equal(box.height, (before.height + after.height) / 2)
  assert.equal(midway.motion?.fading.get('b'), 0.5)
  assert.equal(midway.motion?.activeEdges, 1)
  for (const route of midway.routes) {
    assert.ok(route)
    for (const [i, point] of route.points.slice(1).entries())
      assert.ok(point.x === route.points[i].x || point.y === route.points[i].y)
  }
  const retreat = motionFrame(midway, closed, 0)
  assert.deepEqual(retreat.layout.positions.get('b'), midway.layout.positions.get('b'))
  assert.equal(retreat.motion?.fading.get('b'), 0.5)
  assert.equal(motionFrame(midway, closed, 1), closed)
})

test('manual placement follows the port, rejects collisions and reapplies a saved local offset', async () => {
  const auto = await scene(new Set(tree.items.keys()))
  const box = auto.layout.positions.get('a')!
  const parent = tree.resourceItems.get('a')!.parent!.id
  const owner = auto.layout.positions.get(parent)!
  const point = { x: box.x - 10, y: box.y }
  assert.ok(canPlace(auto, 'a', point))
  assert.ok(!canPlace(auto, 'a', { x: owner.x - 1, y: owner.y }))
  const sibling = auto.layout.positions.get('permission')!
  assert.ok(!canPlace(auto, 'b', sibling))
  const preview = moveCard(auto, 'a', point)
  assert.equal(preview.routes[0]!.points[0].x, auto.routes[0]!.points[0].x - 10)
  const saved = new Map([[placementKey('a', parent), { x: point.x - owner.x, y: point.y - owner.y }]])
  const manuallyPlaced = positionScene(auto, saved, measure)
  assert.equal(manuallyPlaced.layout.positions.get('a')!.x, point.x)
  assert.ok(manuallyPlaced.routes.every(Boolean))
  assert.equal(positionScene(await scene(new Set(tree.items.keys())), saved, measure).layout.positions.get('a')!.x, point.x)
})
