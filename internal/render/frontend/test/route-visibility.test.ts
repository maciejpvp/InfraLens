import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDenseScene, routeLayers, routeVisibility } from '../src/lib/route-visibility.ts'

test('retains route bends crossing the viewport with both endpoints outside', () => {
  const route = { points: [{ x: -100, y: -100 }, { x: 50, y: -100 }, { x: 50, y: 200 }, { x: -100, y: 200 }], d: '' }
  assert.equal(routeVisibility(route, [0, 0, 1], 100, 100), routeLayers.paint)
  assert.equal(routeVisibility(route, [-200, 0, 1], 100, 100), 0)
  assert.equal(routeVisibility(route, [0, -450, 2], 100, 100), 0)
  assert.equal(routeVisibility({ ...route, label: { text: 'Label', style: { left: 230, top: 40 } } },
    [-200, 0, 1], 100, 100), routeLayers.label)
})

test('dense diagrams drop decorative layers while retaining visible highlighted captions', () => {
  const route = {
    points: [{ x: -100, y: 45 }, { x: 200, y: 45 }], d: '',
    label: { text: 'Trigger', style: { left: 4, top: 30 } },
  }
  const both = routeLayers.paint | routeLayers.label
  assert.equal(routeVisibility(route, [0, 0, 0.69], 100, 100), both)
  assert.equal(routeVisibility(route, [0, 0, 0.69], 100, 100, true), 0)
  assert.equal(routeVisibility(route, [0, 0, 0.69], 100, 100, true, true), routeLayers.label)
  assert.equal(routeVisibility(route, [0, 0, 0.7], 100, 100, true), both)
})

test('the dense-scene limit counts cards and actual routes', () => {
  const route = { points: [], d: '' }
  const box = { x: 0, y: 0, width: 1, height: 1, depth: 0 }
  const layout = { width: 1, height: 1, positions: new Map(Array.from({ length: 199 }, (_, i) => [String(i), box])) }
  const routes = Array.from({ length: 199 }, () => route)
  assert.equal(isDenseScene({ layout, routes: [...routes, null] }), false)
  assert.equal(isDenseScene({ layout, routes: [...routes, route] }), true)
  layout.positions.set('last', box)
  assert.equal(isDenseScene({ layout, routes: [] }), true)
})
