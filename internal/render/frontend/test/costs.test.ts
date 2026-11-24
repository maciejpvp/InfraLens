import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assumptionKey, calculateCosts, usageAssumptions } from '../src/features/costs/costs.ts'
import type { CostItem, CostReport } from '../src/features/costs/costs.ts'

const functionItem = (id: string, durationUnits: number): CostItem => ({
  id,
  name: id,
  service: 'lambda',
  monthly: {},
  usage: { charges: [
    { rate: 'requests', quantity: 1_000_000, input: 'operations' },
    { rate: 'duration', quantity: durationUnits, input: 'lambdaMs' },
  ] },
})

test('prices both states with shared assumptions and pools requests into the next tier', () => {
  const report: CostReport = {
    date: '2026-11-24',
    regions: ['us-east-1'],
    before: [functionItem('first', 125)],
    after: [functionItem('first', 250), functionItem('added', 125)],
    rates: {
      requests: [{ price: 0.0000002, upTo: 1_000_000 }, { price: 0.0000001, upTo: null }],
      duration: [{ price: 0.00001, upTo: null }],
    },
  }
  const { total } = calculateCosts(report, {
    [assumptionKey('first', 'operations')]: '2',
    [assumptionKey('first', 'lambdaMs')]: '200',
  })
  assert.ok(Math.abs(total.before.usage.amount - 0.8) < 1e-12)
  assert.ok(Math.abs(total.after.usage.amount - 1.525) < 1e-12)
  assert.equal(total.after.monthly.amount, 0)
  assert.deepEqual(usageAssumptions(report).map(({ item }) => item.id), ['added', 'first'])
})

test('distinguishes unavailable and partial estimates from zero', () => {
  const unsupported: CostItem = {
    id: 'cluster', name: 'Cluster', service: 'ecs',
    monthly: { missing: ['Unsupported'] }, usage: { missing: ['Unsupported'] },
  }
  const report: CostReport = {
    date: '2026-11-24', regions: [], before: [], beforeIssues: ['Missing stack'],
    after: [unsupported, functionItem('first', 125)],
    rates: { requests: [{ price: 0.0000002, upTo: null }], duration: [{ price: 0.00001, upTo: null }] },
  }
  const { rows, total } = calculateCosts(report, {})
  assert.deepEqual(rows.find((row) => row.service === 'ecs')?.after.monthly, { amount: 0, priced: false, missing: ['Unsupported'] })
  assert.deepEqual(total.before.usage, { amount: 0, priced: false, missing: ['Missing stack'] })
  assert.deepEqual(total.after.monthly, { amount: 0, priced: true, missing: ['Unsupported'] })
  assert.equal(total.after.usage.priced, true)
  assert.ok(Math.abs(total.after.usage.amount - 0.325) < 1e-12)
})

test('uses imported values per state and lets offline edits override one state', () => {
  const original = functionItem('worker', 125)
  const report: CostReport = {
    date: '2026-11-24',
    regions: ['us-east-1'],
    usageAssumptions: { scenario: 'One order', baseline: 'HEAD', target: 'working tree' },
    before: [{ ...original, assumptions: { operations: 1, lambdaMs: 120 } }],
    after: [{ ...original, assumptions: { operations: 2, lambdaMs: 200 } }],
    rates: {
      requests: [{ price: 0.0000002, upTo: null }],
      duration: [{ price: 0.00001, upTo: null }],
    },
  }
  const imported = calculateCosts(report, {}).total
  assert.ok(Math.abs(imported.before.usage.amount - 0.35) < 1e-12)
  assert.ok(Math.abs(imported.after.usage.amount - 0.9) < 1e-12)
  assert.equal(imported.after.monthly.amount, 0)
  const updated = calculateCosts(report, { [assumptionKey('worker', 'operations', 'after')]: '0' }).total
  assert.equal(updated.before.usage.amount, imported.before.usage.amount)
  assert.equal(updated.after.usage.amount, 0)
  const reset = calculateCosts(report, { [assumptionKey('worker', 'operations', 'after')]: '' }).total
  assert.equal(reset.after.usage.amount, imported.after.usage.amount)
})
