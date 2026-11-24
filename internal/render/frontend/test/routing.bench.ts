import assert from 'node:assert/strict'
import { buildHierarchy, projectGraph } from '../src/lib/graph-projection.ts'
import { layoutDiagram } from '../src/features/diagram/layout/elk-layout.ts'

for (const count of [76, 150, 300, 500]) {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: 'n' + String(i).padStart(3, '0'),
    name: 'n' + i,
    type: 'aws:lambda/function:Function',
    stack: 'demo/dev',
  }))
  const edges = nodes.flatMap((node, i) =>
    [1, 13]
      .filter((offset) => i + offset < count)
      .map((offset) => ({
        from: node.id,
        to: nodes[i + offset].id,
        kind: 'triggers' as const,
        evidence: [{ source: 'benchmark' }],
      })),
  )
  const tree = buildHierarchy({ nodes, edges })
  const view = projectGraph(tree, 'flow', new Set(), tree.initialExpanded)
  const samples = []
  for (let run = 0; run < 4; run++) {
    const start = performance.now()
    const { routes } = await layoutDiagram(view, (text) => text.length * 7)
    if (run > 0) samples.push(performance.now() - start)
    assert.ok(routes.every(Boolean), 'Every edge should have a route')
  }
  const median = samples.sort((a, b) => a - b)[1]
  console.log(`${count} resources, ${edges.length} edges, ${median.toFixed(0)} ms median`)
}
