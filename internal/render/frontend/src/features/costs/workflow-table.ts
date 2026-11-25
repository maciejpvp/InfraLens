import { normalizeSearch, searchRank, searchWords } from '../../lib/fuzzy-search.ts'
import type { Estimate } from './costs.ts'
import type { WorkflowSide } from './workflows.ts'

export type WorkflowBasis = 'one' | 'million' | 'month'
export const workflowBasisLabels = { one: 'Per run', million: 'Per 1M', month: 'Monthly' } as const
export type WorkflowRow = NonNullable<ReturnType<WorkflowSide['workflows']['get']>>
export type PricingFilter = 'all' | 'full' | 'partial' | 'unpriced' | 'absent'
export type CostOrder = 'report' | 'ascending' | 'descending'

export function workflowEstimate(row: WorkflowRow, basis: WorkflowBasis) {
  return basis === 'month' ? row.month : row[basis].total
}

export function workflowBreakdown(row: WorkflowRow, side: WorkflowSide, basis: WorkflowBasis) {
  return basis === 'month' ? side.month : row[basis]
}

type CostEntry = { labels: string[]; estimate: Estimate; absent?: boolean }

export function filterCostEntries<T extends CostEntry>(entries: T[], text: string, filter: PricingFilter, order: CostOrder) {
  const query = normalizeSearch(text)
  if (text.trim() && !query) return []
  const terms = query.split(' ')
  const matches = entries.filter(({ labels, estimate, absent }) => {
    const status = absent ? 'absent' : !estimate.priced ? 'unpriced' : estimate.missing.length ? 'partial' : 'full'
    return (filter === 'all' || filter === status) && (!query || Number.isFinite(searchRank({
      name: normalizeSearch(labels[0]), fields: labels.map(searchWords),
    }, query, terms)))
  })
  if (order === 'report') return matches
  const direction = order === 'ascending' ? 1 : -1
  return matches.sort((a, b) => {
    const aPriced = !a.absent && a.estimate.priced
    const bPriced = !b.absent && b.estimate.priced
    return Number(bPriced) - Number(aPriced)
      || (aPriced && bPriced ? direction * (a.estimate.amount - b.estimate.amount) : 0)
  })
}

export function workflowOperations(row: WorkflowRow, breakdown: ReturnType<typeof workflowBreakdown>) {
  return row.steps.flatMap((step) => step.fees.map((fee) => ({
    step, fee, labels: [fee.label, step.label], estimate: breakdown.priced.get(fee.id)!.estimate,
  })))
}

export type WorkflowCostShare = { intensity: number; share: number; partial: boolean }

export function workflowCostShares(row: WorkflowRow, side: WorkflowSide, basis: WorkflowBasis, visible: ReadonlySet<string>) {
  const total = workflowEstimate(row, basis)
  const shares = new Map<string, WorkflowCostShare>()
  if (!row.state || !total.priced || total.amount <= 0) return shares

  const amounts = new Map<string, number>()
  for (const { step, estimate } of workflowOperations(row, workflowBreakdown(row, side, basis))) {
    const id = step.resourceId
    if (id && visible.has(id) && estimate.priced) amounts.set(id, (amounts.get(id) ?? 0) + estimate.amount)
  }
  let max = 0
  for (const amount of amounts.values()) max = Math.max(max, amount)
  for (const [id, amount] of amounts) {
    if (amount > 0) shares.set(id, { intensity: amount / max, share: amount / total.amount, partial: total.missing.length > 0 })
  }
  return shares
}
