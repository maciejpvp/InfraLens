import type { Topology } from './graph.types'
import type { Workflows } from './workflows'

export type Tier = { upTo: number | null; price: number }
export type Charge = { rate: string; quantity: number; input?: Input }
export type Metric = { charges?: Charge[]; missing?: string[] }
export type CostItem = {
  id: string
  name: string
  service: string
  monthly: Metric
  usage: Metric
  assumptions?: Partial<Record<Input, number>>
}
export type Catalog = {
  code?: string
  region: string
  rates?: { family?: string; unit: string; min: number; max: number }[]
  issue?: string
}

export type CostReport = {
  date: string
  regions: string[] | null
  fallback?: string
  before?: CostItem[]
  beforeIssues?: string[]
  after: CostItem[]
  rates: Record<string, Tier[]>
  catalogs?: Record<string, Catalog[]>
  workflows?: Workflows
  usageAssumptions?: { scenario?: string; baseline?: string; target?: string; warnings?: string[] }
}

export const assumptions = {
  operations: { label: 'Operations per request', defaultValue: 1, max: 1_000_000 },
  lambdaMs: { label: 'Lambda duration (ms)', defaultValue: 100, max: 900_000 },
  reads: { label: 'Read units per request', defaultValue: 1, max: 1_000_000 },
  writes: { label: 'Write units per request', defaultValue: 0, max: 1_000_000 },
}

type Input = keyof typeof assumptions
export type Scenario = Record<string, string>
export type Estimate = { amount: number; priced: boolean; missing: string[] }
export type Costs = { monthly: Estimate; usage: Estimate }

export const assumptionKey = (id: string, input: Input, side?: Topology) =>
  (side ? side + '/' : '') + id + '/' + input

export const initialAssumption = (item: CostItem, input: Input) =>
  item.assumptions?.[input] ?? assumptions[input].defaultValue

const assumed = (scenario: Scenario, item: CostItem, input: Input, side: Topology) => {
  const raw = scenario[assumptionKey(item.id, input, side)] ?? scenario[assumptionKey(item.id, input)]
  const initial = initialAssumption(item, input)
  const value = raw?.trim() ? Number(raw) : initial
  return Number.isFinite(value) && value >= 0 ? Math.min(value, assumptions[input].max) : initial
}

const quantityFor = (charge: Charge, item: CostItem, scenario: Scenario, side: Topology) => {
  if (!charge.input) return charge.quantity
  const quantity = charge.quantity * assumed(scenario, item, charge.input, side)
  return charge.input === 'lambdaMs' ? quantity * assumed(scenario, item, 'operations', side) : quantity
}

export const usageAssumptions = (report: CostReport, side?: Topology) => {
  const items = new Map<string, { item: CostItem; inputs: Set<Input> }>()
  const snapshot = side ? (report[side] ?? []) : [...report.after, ...(report.before ?? [])]
  for (const item of snapshot) {
    const entry = items.get(item.id) ?? { item, inputs: new Set<Input>() }
    for (const { input } of item.usage.charges ?? []) {
      if (!input) continue
      entry.inputs.add(input)
      if (input === 'lambdaMs') entry.inputs.add('operations')
    }
    if (entry.inputs.size) items.set(item.id, entry)
  }
  return [...items.values()].sort((a, b) => a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id))
}

export const tieredCost = (quantity: number, tiers: Tier[]) => {
  let total = 0
  let previous = 0
  for (const { upTo, price } of tiers) {
    const end = upTo ?? quantity
    total += price * Math.max(0, Math.min(end, quantity) - previous)
    if (end >= quantity) break
    previous = end
  }
  return total
}

const estimate = (
  items: CostItem[], metric: keyof Costs, rates: CostReport['rates'], scenario: Scenario, issues: string[], side: Topology,
): Estimate => {
  const quantities = new Map<string, number>()
  const missing = new Set(issues)
  let priced = false
  for (const item of items) {
    if (!item[metric].missing?.length) priced = true
    for (const reason of item[metric].missing ?? []) missing.add(reason)
    for (const charge of item[metric].charges ?? []) {
      const quantity = quantityFor(charge, item, scenario, side)
      quantities.set(charge.rate, (quantities.get(charge.rate) ?? 0) + quantity)
    }
  }
  let amount = 0
  for (const [rate, quantity] of quantities) amount += tieredCost(quantity, rates[rate])
  return { amount, priced: priced || quantities.size > 0 || missing.size === 0, missing: [...missing] }
}

export const calculateCosts = (report: CostReport, scenario: Scenario) => {
  const groups = new Map<string, { before: CostItem[]; after: CostItem[] }>()
  for (const side of ['before', 'after'] as const) {
    for (const item of report[side] ?? []) {
      const group = groups.get(item.service) ?? { before: [], after: [] }
      group[side].push(item)
      groups.set(item.service, group)
    }
  }
  const issues = report.beforeIssues ?? []
  const costs = (items: CostItem[], side: Topology): Costs => {
    const stateIssues = side === 'before' ? issues : []
    return {
      monthly: estimate(items, 'monthly', report.rates, scenario, stateIssues, side),
      usage: estimate(items, 'usage', report.rates, scenario, stateIssues, side),
    }
  }
  const rows = [...groups].map(([service, items]) => ({
    service, before: costs(items.before, 'before'), after: costs(items.after, 'after'),
  }))
  const total = {
    before: costs(report.before ?? [], 'before'),
    after: costs(report.after, 'after'),
  }
  return { rows, total }
}
