import type { Charge, CostReport, Estimate, Metric, Tier } from './costs.ts'
import { tieredCost } from './costs.ts'
import type { Graph, GraphEdge, Topology } from './graph.types.ts'

export type Factor = { label: string; unit?: string; value: number | null }
export type WorkflowMeter = { label: string; unit?: string; factors: Factor[]; pricing: Metric; evidence?: string[]; note?: string }
export type WorkflowStep = {
  id: string; label: string; resourceId?: string; evidence?: string[]; issue?: string; meters: WorkflowMeter[]
}
export type WorkflowLink = { from: string; to: string; evidence?: string[] }
export type WorkflowState = {
  runsPerUser: number | null; frequencyEvidence?: string; steps: WorkflowStep[]; links?: WorkflowLink[]; issues?: string[]; findings?: string[]
}
export type Workflow = { id: string; label: string; before: WorkflowState | null; after: WorkflowState | null }
export type Workflows = {
  activeUsers: number | null; scenario?: string; baseline?: string; target?: string; items: Workflow[]
  sharedMonthly: Partial<Record<Topology, WorkflowStep[]>>
}
export type WorkflowSelection = { id: string; side: Topology }
export type WorkflowPath = { side: Topology; nodes: ReadonlySet<string>; edges: ReadonlySet<GraphEdge>; inferred: GraphEdge[] }
export type WorkflowEdits = Record<string, string>

export const workflowUserPresets = [{ value: 1_000, label: "1K" }, { value: 10_000, label: "10K" }, { value: 100_000, label: "100K" }]
export const maxWorkflowInput = 1e12
export const workflowKey = (...path: (string | number)[]) => JSON.stringify(path)
export const workflowValue = (edits: WorkflowEdits, key: string, initial: number | null) => {
  const text = edits[key]
  if (text === undefined) return initial
  if (!text.trim()) return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value <= maxWorkflowInput ? value : null
}

type RateUse = { rate: string; units: number; multiplier: number }

export type WorkflowFee = {
  id: string
  label: string
  unit?: string
  note?: string
  factors: (Factor & { key: string })[]
  quantity: number | null
  uses: RateUse[]
  missing: string[]
  evidence: string[]
}

export type PricedFee = { estimate: Estimate; uses: { rate: string; units: number; pool: number; amount: number }[] }

const fee = (
  id: string, label: string, factors: WorkflowFee['factors'], pricing: Metric, charges: Charge[],
  evidence: string[], note?: string,
): WorkflowFee => {
  const quantity = factors.some(({ value }) => value === null)
    ? null : factors.reduce((total, { value }) => total * (value ?? 0), 1)
  const missing = quantity === 0 ? [] : [...(pricing.missing ?? [])]
  if (quantity === null && (!note || charges.length || missing.length)) missing.push('Quantity is unknown.')
  return {
    id, label, note, factors, quantity, evidence, missing,
    uses: quantity === null ? [] : charges.map(({ rate, quantity: multiplier }) => ({
      rate, units: quantity * multiplier, multiplier,
    })),
  }
}

const stepFees = (steps: WorkflowStep[], edits: WorkflowEdits, side: Topology, scope: string) =>
  steps.map((step) => ({
    ...step,
    fees: step.meters.map((meter, index) => {
      const id = workflowKey(side, scope, step.id, index)
      const factors = meter.factors.map((factor, i) => {
        const key = workflowKey(id, i)
        return { ...factor, key, value: workflowValue(edits, key, factor.value) }
      })
      return { ...fee(id, meter.label, factors, meter.pricing, meter.pricing.charges ?? [], meter.evidence ?? [], meter.note), unit: meter.unit }
    }),
  }))

type PoolEntry = { rate: string; quantity: number }

export const priceWorkflowFees = (
  entries: { fee: WorkflowFee; runs: number | null }[], rates: Record<string, Tier[]>, issues: string[] = [],
) => {
  const pools = new Map<string, number>()
  const rows = entries.map(({ fee, runs }) => {
    const missing = runs === 0 ? [] : [...fee.missing]
    if (runs === null) missing.push('Monthly execution count is unknown.')
    const uses: PoolEntry[] = []
    if (runs !== null) {
      for (const use of fee.uses) {
        const quantity = use.units * runs
        if (!Number.isFinite(quantity) || !rates[use.rate]) {
          missing.push('Rate or scaled quantity is unavailable.')
        } else {
          pools.set(use.rate, (pools.get(use.rate) ?? 0) + quantity)
          uses.push({ rate: use.rate, quantity })
        }
      }
    }
    return { fee, uses, missing }
  })
  const poolCosts = new Map([...pools].map(([rate, quantity]) => [rate, tieredCost(quantity, rates[rate])]))
  const priced = new Map<string, PricedFee>()
  const missing = new Set(issues)
  let hasEstimate = false
  for (const row of rows) {
    const uses = row.uses.map(({ rate, quantity }) => {
      const pool = pools.get(rate) ?? 0
      return { rate, units: quantity, pool, amount: pool ? (poolCosts.get(rate) ?? 0) * (quantity / pool) : 0 }
    })
    const amount = uses.reduce((total, use) => total + use.amount, 0)
    const known = uses.length > 0 || row.missing.length === 0
    hasEstimate ||= known
    for (const reason of row.missing) missing.add(reason)
    priced.set(row.fee.id, { estimate: { amount, priced: known, missing: row.missing }, uses })
  }
  const total: Estimate = {
    amount: [...poolCosts.values()].reduce((sum, amount) => sum + amount, 0),
    priced: hasEstimate || missing.size === 0,
    missing: [...missing],
  }
  return { total, priced }
}

const subtotal = (
  priced: ReadonlyMap<string, PricedFee>, fees: WorkflowFee[], issues: string[],
): Estimate => {
  const rows = fees.map(({ id }) => priced.get(id)!.estimate)
  const missing = [...new Set([...issues, ...rows.flatMap((row) => row.missing)])]
  return {
    amount: rows.reduce((total, row) => total + row.amount, 0),
    priced: missing.length === 0 || rows.some((row) => row.priced),
    missing,
  }
}

const flatFees = (steps: ReturnType<typeof stepFees>) => steps.flatMap(({ fees }) => fees)
const stepIssues = (steps: WorkflowStep[]) => steps.flatMap(({ issue }) => issue ? [issue] : [])

export const buildWorkflowSide = (report: CostReport, side: Topology, edits: WorkflowEdits) => {
  const source = report.workflows!
  const users = workflowValue(edits, 'users', source.activeUsers ?? workflowUserPresets[0].value)
  const stateIssues = side === 'before' ? (report.beforeIssues ?? []) : []
  const items = report[side] ?? []
  const serviceById = new Map(items.map(({ id, service }) => [id, service]))
  const monthlyItems = items.filter((item) => item.monthly.charges?.length || item.monthly.missing?.length)
  const monthly = monthlyItems.map((item) =>
    fee(workflowKey('base', side, item.id), item.name, [], item.monthly, item.monthly.charges ?? [], []))
  const shared = stepFees(source.sharedMonthly[side] ?? [], edits, side, 'shared')
  const sharedFees = flatFees(shared)
  const workflows = source.items.map((workflow) => {
    const state = workflow[side]
    const frequencyKey = workflowKey(side, workflow.id, 'frequency')
    const frequency = workflowValue(edits, frequencyKey, state?.runsPerUser ?? null)
    // An absent endpoint represents no traffic; an unknown state is an issue-bearing object.
    const runs = !state || users === 0 || frequency === 0 ? 0
      : users === null || frequency === null ? null : users * frequency
    const steps = stepFees(state?.steps ?? [], edits, side, workflowKey('workflow', workflow.id))
    const fees = flatFees(steps)
    const issues = [...stateIssues, ...(state?.issues ?? []), ...stepIssues(steps)]
    const invocations = (count: number) => fees.map((entry) => ({ fee: entry, runs: count }))
    return {
      workflow, state, frequency, frequencyKey, runs, steps, fees, issues,
      one: priceWorkflowFees(invocations(1), report.rates, issues),
      million: priceWorkflowFees(invocations(1_000_000), report.rates, issues),
    }
  })
  const usageIssues = [
    ...stateIssues,
    ...stepIssues(shared),
    ...workflows.flatMap(({ issues, runs }) =>
      runs === 0 ? [] : runs === null ? [...issues, 'Monthly execution count is unknown.'] : issues),
  ]
  const month = priceWorkflowFees([
    ...[...monthly, ...sharedFees].map((entry) => ({ fee: entry, runs: 1 })),
    ...workflows.flatMap(({ fees, runs }) => fees.map((entry) => ({ fee: entry, runs }))),
  ], report.rates, usageIssues)
  type Bucket = { fees: WorkflowFee[]; issues: string[] }
  const bucket = (): Bucket => ({ fees: [], issues: [] })
  const groups = new Map<string, { fixed: Bucket; usage: Bucket }>()
  const add = (
    service: string | undefined, kind: 'fixed' | 'usage', fees: WorkflowFee[], issues: string[] = [],
  ) => {
    if (!fees.length && !issues.length) return
    const key = service || ''
    const group = groups.get(key) ?? { fixed: bucket(), usage: bucket() }
    group[kind].fees.push(...fees)
    group[kind].issues.push(...issues)
    groups.set(key, group)
  }
  for (const [index, item] of monthlyItems.entries()) add(item.service, 'fixed', [monthly[index]])
  for (const step of shared) add(serviceById.get(step.resourceId ?? ''), 'usage', step.fees, stepIssues([step]))
  for (const { state, steps, runs } of workflows) {
    for (const step of steps) {
      add(serviceById.get(step.resourceId ?? ''), 'usage', step.fees, runs === 0 ? [] : stepIssues([step]))
    }
    if (runs !== 0) add(undefined, 'usage', [], [
      ...(state?.issues ?? []), ...(runs === null && !steps.some(({ fees }) => fees.length) ? ['Monthly execution count is unknown.'] : []),
    ])
  }
  const services = new Map([...groups].map(([service, group]) => [service, {
    fixed: subtotal(month.priced, group.fixed.fees, [...stateIssues, ...group.fixed.issues]),
    usage: subtotal(month.priced, group.usage.fees, [...stateIssues, ...group.usage.issues]),
    monthly: subtotal(month.priced, [...group.fixed.fees, ...group.usage.fees],
      [...stateIssues, ...group.fixed.issues, ...group.usage.issues]),
  }]))
  const fixedTotal = subtotal(month.priced, monthly, stateIssues)
  return {
    users, month, shared, baseline: monthly, services, fixedTotal,
    totals: {
      fixed: fixedTotal,
      usage: subtotal(month.priced, [...sharedFees, ...workflows.flatMap(({ fees }) => fees)], usageIssues),
      monthly: month.total,
    },
    workflows: new Map(workflows.map((row) => [
      row.workflow.id, { ...row, month: subtotal(month.priced, row.fees,
        row.runs === 0 ? stateIssues : row.runs === null ? [...row.issues, 'Monthly execution count is unknown.'] : row.issues) },
    ])),
  }
}

export type WorkflowSide = ReturnType<typeof buildWorkflowSide>

export const workflowsForResource = (source: Workflows | undefined, resourceId: string, side: Topology) =>
  source?.items.filter((workflow) => workflow[side]?.steps.some((step) => step.resourceId === resourceId)) ?? []

export const workflowPath = (graph: Graph, workflow: Workflow | undefined, side: Topology): WorkflowPath | undefined => {
  const state = workflow?.[side]
  if (!workflow) return undefined
  if (!state?.steps.length) return { side, nodes: new Set(), edges: new Set(), inferred: [] }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const byStep = new Map(state.steps.map((step) => [step.id, step]))
  const nodes = new Set(state.steps.flatMap(({ resourceId }) => resourceId && byId.has(resourceId) ? [resourceId] : []))
  const outgoing = new Map<string, WorkflowLink[]>()
  for (const link of state.links ?? []) {
    const links = outgoing.get(link.from) ?? []
    links.push(link)
    outgoing.set(link.from, links)
  }
  const flow = new Map<string, GraphEdge[]>()
  for (const edge of graph.edges) {
    if ((edge.state && edge.state !== side) || (edge.kind !== 'connects_to' && edge.kind !== 'triggers')) continue
    const key = workflowKey(edge.from, edge.to)
    const matching = flow.get(key) ?? []
    matching.push(edge)
    flow.set(key, matching)
  }
  const edges = new Set<GraphEdge>()
  const inferred: GraphEdge[] = []
  const seenPairs = new Set<string>()
  for (const start of state.steps) {
    const from = start.resourceId
    if (!from || !nodes.has(from)) continue
    const queue = [...(outgoing.get(start.id) ?? [])]
    const visited = new Set([start.id])
    for (const link of queue) {
      if (visited.has(link.to)) continue
      visited.add(link.to)
      const target = byStep.get(link.to)
      const to = target?.resourceId
      if (!to || !nodes.has(to)) {
        if (target && !target.resourceId && !target.issue) queue.push(...(outgoing.get(link.to) ?? []))
        continue
      }
      const key = workflowKey(from, to)
      if (to === from || seenPairs.has(key)) continue
      seenPairs.add(key)
      const existing = flow.get(key)
      if (existing) {
        for (const edge of existing) edges.add(edge)
      } else {
        const edge: GraphEdge = { from, to, kind: 'connects_to', state: side, evidence: [{
          source: 'cost-workflow', label: target.label, details: link.evidence?.join(', '),
        }] }
        inferred.push(edge)
        edges.add(edge)
      }
    }
  }
  return { side, nodes, edges, inferred }
}

export const workflowGraph = (graph: Graph, path: WorkflowPath): Graph => ({
  ...graph, nodes: graph.nodes.filter(({ id }) => path.nodes.has(id)), edges: [...path.edges],
})

const displayQuantity = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 })

export const workflowUsage = (workflow: Workflow | undefined, side: Topology, edits: WorkflowEdits) => {
  const notes = new Map<string, string[]>()
  if (!workflow) return notes
  for (const step of stepFees(workflow[side]?.steps ?? [], edits, side, workflowKey('workflow', workflow.id))) {
    if (!step.resourceId || !step.fees.length) continue
    const lines = notes.get(step.resourceId) ?? []
    for (const [index, fee] of step.fees.entries()) {
      const unit = step.meters[index].unit ?? ''
      const quantity = fee.quantity === null ? 'unknown' : displayQuantity.format(fee.quantity)
      lines.push(`${fee.label} ${quantity}${unit ? ' ' + unit : ''}`)
    }
    notes.set(step.resourceId, lines)
  }
  return notes
}
