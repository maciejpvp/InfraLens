import { useRef, useState } from 'react'
import { connectionLegendConfig } from '../components/connection-legend.config'

export const useConnectionLegend = () => {
  const [legendOpen, setLegendOpen] = useState(
    () => window.matchMedia(connectionLegendConfig.expandedQuery).matches,
  )
  const legendRef = useRef<HTMLElement>(null)
  const [playing, setPlaying] = useState(true)

  return {
    legendOpen,
    legendRef,
    playing,
    motionAction: playing ? 'Pause flow animation' : 'Resume flow animation',
    toggleLegend: () => setLegendOpen((open) => !open),
    toggleMotion: () => setPlaying((value) => !value),
  }
}
