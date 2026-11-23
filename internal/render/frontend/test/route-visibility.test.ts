import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeLayers, routeVisibility } from '../src/lib/route-visibility.ts'

test('retains route bends crossing the viewport with both endpoints outside', () => {
  const route = { points: [{ x: -100, y: -100 }, { x: 50, y: -100 }, { x: 50, y: 200 }, { x: -100, y: 200 }], d: '' }
  assert.equal(routeVisibility(route, [0, 0, 1], 100, 100), routeLayers.paint)
  assert.equal(routeVisibility(route, [-200, 0, 1], 100, 100), 0)
  assert.equal(routeVisibility(route, [0, -450, 2], 100, 100), 0)
  assert.equal(routeVisibility({ ...route, label: { text: 'Label', style: { left: 230, top: 40 } } },
    [-200, 0, 1], 100, 100), routeLayers.label)
})
