import { pipeAppearance, pipeKinds } from './connection-pipes.config'
import { pipePaint } from './connection-pipes.variants'

export const connectionLegendConfig = {
  expandedQuery: '(min-width: 621px)',
  entries: pipeKinds.map((kind) => ({
    kind,
    label: pipeAppearance[kind].label,
    ...pipePaint[kind],
  })),
}
