import type { ReactNode } from 'react'
import { Input } from '../../ui/input'
import { NativeSelect } from '../../ui/native-select'
import { workflowBasisLabels } from './workflow-table'
import type { CostOrder, PricingFilter, WorkflowBasis } from './workflow-table'

export function WorkflowBasisSelect({ label, value, onChange }: {
  label: string; value: WorkflowBasis; onChange: (basis: WorkflowBasis) => void
}) {
  return (
    <NativeSelect size="sm" aria-label={label} value={value}
      onChange={(event) => onChange(event.currentTarget.value as WorkflowBasis)}>
      {Object.entries(workflowBasisLabels).map(([basis, name]) => <option key={basis} value={basis}>{name}</option>)}
    </NativeSelect>
  )
}

export type WorkflowTableFilter = { query: string; pricing: PricingFilter; order: CostOrder }
export const defaultWorkflowTableFilter: WorkflowTableFilter = { query: '', pricing: 'all', order: 'report' }

export function WorkflowTableControls({ filter, onChange, list = false, children }: {
  filter: WorkflowTableFilter; onChange: (filter: WorkflowTableFilter) => void; list?: boolean; children?: ReactNode
}) {
  const searchLabel = list ? 'Search workflows' : 'Search operations'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="search" aria-label={searchLabel} placeholder={searchLabel}
        className="h-8 min-w-40 flex-1" value={filter.query}
        onChange={(event) => onChange({ ...filter, query: event.currentTarget.value })} />
      <NativeSelect size="sm" aria-label={list ? 'Workflow pricing status' : 'Operation pricing status'} value={filter.pricing}
        onChange={(event) => onChange({ ...filter, pricing: event.currentTarget.value as PricingFilter })}>
        <option value="all">All pricing statuses</option>
        <option value="full">Fully priced</option>
        <option value="partial">Partially priced</option>
        <option value="unpriced">Unpriced</option>
        {list && <option value="absent">Absent in this snapshot</option>}
      </NativeSelect>
      {children}
      <NativeSelect size="sm" aria-label={list ? 'Sort workflows' : 'Sort operations'} value={filter.order}
        onChange={(event) => onChange({ ...filter, order: event.currentTarget.value as CostOrder })}>
        <option value="report">Report order</option>
        <option value="ascending">Cost ↑</option>
        <option value="descending">Cost ↓</option>
      </NativeSelect>
    </div>
  )
}
