import { useRef, useState } from 'react'
import { connectionLegendConfig } from '../components/connection-legend.config'
import type { ProjectedEdge } from '../lib/graph.types'

type ConnectionKind = ProjectedEdge['kind']

export const useConnectionLegend = () => {
  const [legendOpen, setLegendOpen] = useState(
    () => window.matchMedia(connectionLegendConfig.expandedQuery).matches,
  )
  const legendRef = useRef<HTMLElement>(null)
  const [playing, setPlaying] = useState(true)
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<ConnectionKind>>(() => new Set())
  const setKindVisible = (kind: ConnectionKind, visible: boolean) => {
    setHiddenKinds((previous) => {
      if (previous.has(kind) === !visible) return previous
      const next = new Set(previous)
      if (visible) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  return {
    legendOpen,
    legendRef,
    playing,
    hiddenKinds,
    setKindVisible,
    motionAction: playing ? 'Pause flow animation' : 'Resume flow animation',
    toggleLegend: () => setLegendOpen((open) => !open),
    toggleMotion: () => setPlaying((value) => !value),
  }
}
