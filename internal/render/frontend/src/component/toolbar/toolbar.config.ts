import { topologyNames } from '../../lib/graph-view.config'

export const viewModes = [
  { value: 'flow', id: 'flow-view', label: 'Flow' },
  { value: 'infra', id: 'infra-view', label: 'Infrastructure' },
] as const

export const topologyOptions = [
  { value: 'after', label: topologyNames.after },
  { value: 'before', label: topologyNames.before },
]

export const relationLegend = [
  { kind: 'triggers', label: 'Event / invocation' },
  { kind: 'connects_to', label: 'Configuration reference' },
  { kind: 'depends_on', label: 'Deployment dependency' },
] as const

export const mapZoom = { in: 0.8, out: 1.25 }
