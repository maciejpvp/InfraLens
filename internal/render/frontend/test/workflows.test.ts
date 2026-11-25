import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CostReport } from '../src/features/costs/costs.ts'
import { layoutDiagram } from '../src/features/diagram/layout/elk-layout.ts'
import { buildHierarchy, projectGraph } from '../src/lib/graph-projection.ts'
import type { Graph, GraphEdge } from '../src/lib/graph.types.ts'
import type { WorkflowMeter, WorkflowState } from '../src/features/costs/workflows.ts'
import { buildWorkflowSide, workflowKey, workflowPath, workflowsForResource, workflowGraph, workflowUsage, workflowUserPresets } from '../src/features/costs/workflows.ts'
import { filterCostEntries, workflowBreakdown, workflowCostShares, workflowOperations } from '../src/features/costs/workflow-table.ts'

const meter = (label: string, rate: string, value: number | null): WorkflowMeter => ({
  label, factors: [{ label, value }], pricing: { charges: [{ rate, quantity: 1 }] },
})
const state = (runsPerUser: number, endpoint: string, meters: WorkflowMeter[]): WorkflowState => ({
  runsPerUser,
  steps: [
    { id: 'api', resourceId: endpoint, label: 'API', meters: [] },
    { id: 'worker', resourceId: 'lambda', label: 'Lambda', meters: [] },
    { id: 'db', resourceId: 'database', label: 'DynamoDB', meters: [] },
    { id: 'client', label: 'Client', meters: [] },
    { id: 'file', resourceId: 'bucket', label: 'S3', meters },
  ],
  links: [{ from: 'api', to: 'worker' }, { from: 'worker', to: 'db' },
    { from: 'worker', to: 'client' }, { from: 'client', to: 'file', evidence: ['client.ts:2'] }],
})
const report: CostReport = {
  date: '', regions: [], before: [], after: [],
  rates: {
    get: [{ price: 2, upTo: 10 }, { price: 1, upTo: null }],
    put: [{ price: 3, upTo: null }],
    egress: [{ price: 4, upTo: null }],
    storage: [{ price: 0.25, upTo: null }],
  },
  workflows: {
    activeUsers: 10,
    sharedMonthly: {
      after: [{ id: 'shared', label: 'Storage', resourceId: 'bucket', meters: [meter('GB-Month', 'storage', 100)] }],
    },
    items: [
      { id: 'play', label: 'GET /play', before: state(1, 'a', [meter('GET', 'get', 2)]),
        after: state(2, 'a', [meter('GET', 'get', 2), meter('Egress GB', 'egress', null)]) },
      { id: 'edit', label: 'PUT /edit', before: null,
        after: state(1, 'b', [meter('GET', 'get', 1), meter('PUT', 'put', 1)]) },
    ],
  },
}

test('filters fuzzy matches and pricing status, then sorts priced rows before unknown costs', () => {
  const rows = [
    { id: 'unknown', labels: ['Unknown'], estimate: { amount: 0, priced: false, missing: ['Rate'] } },
    { id: 'partial', labels: ['PlaySong'], estimate: { amount: 0.0019, priced: true, missing: ['Rate'] } },
    { id: 'absent', labels: ['Absent'], estimate: { amount: 0, priced: true, missing: [] }, absent: true },
    { id: 'full', labels: ['Edit song'], estimate: { amount: 0.0011, priced: true, missing: [] } },
    { id: 'tie', labels: ['Another song'], estimate: { amount: 0.0019, priced: true, missing: [] } },
  ]
  assert.deepEqual(filterCostEntries(rows, 'nonexistent', 'all', 'report'), [])
  assert.deepEqual(filterCostEntries(rows, 'palY song', 'partial', 'report').map(({ id }) => id), ['partial'])
  assert.deepEqual(filterCostEntries(rows, '', 'full', 'report').map(({ id }) => id), ['full', 'tie'])
  assert.deepEqual(filterCostEntries(rows, '', 'unpriced', 'report').map(({ id }) => id), ['unknown'])
  assert.deepEqual(filterCostEntries(rows, '', 'absent', 'report').map(({ id }) => id), ['absent'])
  assert.deepEqual(filterCostEntries(rows, '', 'all', 'ascending').map(({ id }) => id), ['full', 'partial', 'tie', 'unknown', 'absent'])
  assert.deepEqual(filterCostEntries(rows, '', 'all', 'descending').map(({ id }) => id), ['partial', 'tie', 'full', 'unknown', 'absent'])
})

test('sorts operations across steps and maps their known costs to visible workflow resources', () => {
  const workflow = report.workflows!.items[0]
  const after = { ...workflow.after!, steps: [...workflow.after!.steps,
    { id: 'copy', label: 'CopySong', resourceId: 'bucket', meters: [meter('Copy', 'get', 1)] },
    { id: 'submit', label: 'Submit job', resourceId: 'lambda', meters: [meter('Submit', 'put', 1)] },
    { id: 'external', label: 'External', meters: [meter('Upload', 'put', 1)] },
  ] }
  const modified = { ...report, workflows: { ...report.workflows!, items: [{ ...workflow, after }] } }
  const current = buildWorkflowSide(modified, 'after', {})
  const row = current.workflows.get('play')!
  const operations = workflowOperations(row, workflowBreakdown(row, current, 'one'))
  assert.deepEqual(filterCostEntries(operations, 'cpoy song', 'all', 'report').map(({ fee }) => fee.label), ['Copy'])
  assert.deepEqual(filterCostEntries(operations, '', 'all', 'descending').map(({ fee }) => fee.label),
    ['GET', 'Submit', 'Upload', 'Copy', 'Egress GB'])
  const visible = new Set(['bucket', 'lambda', 'database'])
  assert.deepEqual([...workflowCostShares(row, current, 'one', visible)], [
    ['bucket', { intensity: 1, share: 0.5, partial: true }],
    ['lambda', { intensity: 0.5, share: 0.25, partial: true }],
  ])
  assert.deepEqual(workflowCostShares(row, current, 'one', new Set(['lambda'])).get('lambda'),
    { intensity: 1, share: 0.25, partial: true })
  assert.notEqual(workflowCostShares(row, current, 'month', visible).get('bucket')?.share, 0.5)
  const zeroUsage = buildWorkflowSide(modified, 'after', { users: '0' })
  assert.equal(workflowCostShares(zeroUsage.workflows.get('play')!, zeroUsage, 'month', visible).size, 0)
})

test('prices workflow traffic, pools monthly tiers and counts shared storage once', () => {
  const before = buildWorkflowSide(report, 'before', {})
  const after = buildWorkflowSide(report, 'after', {})
  assert.equal(before.month.total.amount, 30)
  assert.equal(after.workflows.get('play')?.one.total.amount, 4)
  assert.equal(after.workflows.get('edit')?.one.total.amount, 5)
  assert.equal(after.fixedTotal.amount, 0)
  assert.equal(after.month.total.amount, 115)
  assert.ok(after.month.total.missing.includes('Quantity is unknown.'))
  assert.equal(after.workflows.get('play')?.month.amount, 48)
  assert.equal(after.workflows.get('edit')?.month.amount, 42)
  const egress = after.workflows.get('play')!.fees[1]
  const updated = buildWorkflowSide(report, 'after', { [egress.factors[0].key]: '0.5' })
  assert.equal(updated.month.total.amount, 155)
  assert.deepEqual(updated.month.total.missing, [])
  const changedFrequency = buildWorkflowSide(report, 'after', { [workflowKey('after', 'play', 'frequency')]: '0' })
  assert.equal(changedFrequency.month.total.amount, 75)
  assert.deepEqual(changedFrequency.month.total.missing, [])
})

test('shows both paths for a shared Lambda and labels code-derived graph connections', async () => {
  const edge: GraphEdge = { from: 'a', to: 'lambda', kind: 'triggers', state: 'after', evidence: [{ source: 'AWS' }] }
  const other: GraphEdge = { ...edge, from: 'b' }
  const deploymentOnly: GraphEdge = { ...edge, from: 'lambda', to: 'database', kind: 'depends_on' }
  const graph: Graph = {
    nodes: ['a', 'b', 'lambda', 'database', 'bucket', 'thumbnail'].map((id) => ({ id, name: id, type: 'AWS' })),
    edges: [edge, other, deploymentOnly],
  }
  const source = report.workflows!
  assert.deepEqual(workflowsForResource(source, 'lambda', 'after').map(({ id }) => id), ['play', 'edit'])
  assert.deepEqual(workflowsForResource(source, 'lambda', 'before').map(({ id }) => id), ['play'])
  const play = source.items[0]
  const after = play.after!
  const asyncWorkflow = { ...play, after: { ...after,
    steps: [...after.steps, { id: 'resize', resourceId: 'thumbnail', label: 'Thumbnail', meters: [] }],
    links: [...after.links!, { from: 'file', to: 'resize', evidence: ['infra.ts:31 (ObjectCreated)'] }],
  } }
  const path = workflowPath(graph, asyncWorkflow, 'after')!
  assert.deepEqual([...path.nodes], ['a', 'lambda', 'database', 'bucket', 'thumbnail'])
  assert.ok(path.edges.has(edge))
  assert.ok(!path.edges.has(other) && !path.edges.has(deploymentOnly))
  assert.deepEqual(path.inferred.map(({ from, to }) => [from, to]), [['lambda', 'database'], ['lambda', 'bucket'], ['bucket', 'thumbnail']])
  assert.equal(path.inferred[1].evidence[0].source, 'cost-workflow')
  const isolated = workflowGraph(graph, path)
  const tree = buildHierarchy(isolated, 'after', 'workflow')
  const view = projectGraph(tree, 'infra', new Set(), tree.initialExpanded)
  assert.deepEqual([...view.items.keys()], ['a', 'bucket', 'database', 'lambda', 'thumbnail'])
  assert.ok(view.edges.some(({ from, to }) => from === 'bucket' && to === 'thumbnail'))
  assert.ok(view.edges.every(({ kind }) => kind !== 'depends_on'))
  const { layout } = await layoutDiagram(view, (text) => text.length * 6, 'DOWN')
  assert.ok(layout.positions.get('a')!.y < layout.positions.get('lambda')!.y)
  assert.equal(graph.nodes.length, 6)
  assert.equal(graph.edges.length, 3)
  const quantityKey = buildWorkflowSide(report, 'after', {}).workflows.get('play')!.fees[0].factors[0].key
  assert.deepEqual(workflowUsage(play, 'after', { [quantityKey]: '3' }).get('bucket'), ['GET 3', 'Egress GB unknown'])
})


test('uses the same monthly active user scenario for each workflow', () => {
  const withoutUsers = { ...report, workflows: { ...report.workflows!, activeUsers: null } }
  assert.equal(buildWorkflowSide(withoutUsers, 'after', {}).workflows.get('play')?.runs, 2_000)
  for (const { value } of workflowUserPresets) {
    const monthly = buildWorkflowSide(withoutUsers, 'after', { users: String(value) })
    assert.equal(monthly.workflows.get('play')?.runs, 2 * value)
    assert.equal(monthly.workflows.get('edit')?.runs, value)
  }
})

test('attributes the same monthly charges to services, including shared and unattributed costs', () => {
  const modeled = structuredClone(report)
  modeled.before = [{ id: 'bucket', name: 'Bucket', service: 's3', monthly: {}, usage: {} }]
  modeled.after = [
    ...modeled.before,
    { id: 'lambda', name: 'Worker', service: 'lambda',
      monthly: { charges: [{ rate: 'storage', quantity: 4 }] }, usage: { charges: [{ rate: 'put', quantity: 1_000_000 }] } },
  ]
  modeled.workflows!.items[1].after!.steps.find(({ id }) => id === 'client')!.meters.push(meter('External', 'put', 2))
  const after = buildWorkflowSide(modeled, 'after', {})
  const before = buildWorkflowSide(modeled, 'before', {})
  assert.equal(before.services.get('s3')?.monthly.amount, 30)
  assert.equal(after.services.get('s3')?.fixed.amount, 0)
  assert.equal(after.services.get('s3')?.usage.amount, 115)
  assert.deepEqual(after.services.get('s3')?.usage.missing, ['Quantity is unknown.'])
  assert.equal(after.services.get('lambda')?.monthly.amount, 1)
  assert.equal(after.services.get('lambda')?.usage.amount, 0)
  assert.equal(after.services.get('')?.usage.amount, 60)
  assert.equal(after.totals.usage.amount, 175)
  assert.equal(after.totals.monthly.amount, 176)
  const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0)
  assert.equal(sum([...after.workflows.values()].map(({ month }) => month.amount)) + 25, after.totals.usage.amount)
  assert.equal(sum([...after.services.values()].map(({ monthly }) => monthly.amount)), after.totals.monthly.amount)
  const revised = buildWorkflowSide(modeled, 'after', { users: '20' })
  assert.equal(revised.totals.fixed.amount, after.totals.fixed.amount)
  assert.equal(revised.services.get('s3')?.usage.amount, 195)
  assert.equal(revised.services.get('')?.usage.amount, 120)
})

test('missing shared storage affects usage without implying an unknown fixed charge', () => {
  const modeled = structuredClone(report)
  modeled.after = [{ id: 'bucket', name: 'Table', service: 'dynamodb', monthly: {}, usage: {} }]
  modeled.workflows!.sharedMonthly.after![0].meters[0].factors[0].value = null
  const dynamo = buildWorkflowSide(modeled, 'after', {}).services.get('dynamodb')!
  assert.deepEqual(dynamo.fixed, { amount: 0, priced: true, missing: [] })
  assert.deepEqual(dynamo.usage.missing, ['Quantity is unknown.'])
  assert.deepEqual(dynamo.monthly.missing, dynamo.usage.missing)
})
