import { useEffect, useRef, useState } from 'react'
import { CostWindow } from '../features/costs/cost-window'
import type { CostReport } from '../features/costs/costs'
import { Diagram } from '../features/diagram/diagram'
import { DetailsDialog } from '../features/inspector/details-dialog'
import { useTheme } from '../hooks/use-theme'
import type { Graph, ServiceIcons } from '../lib/graph.types'
import { useReport } from './use-report'

export function App({ graph, icons, costs }: { graph: Graph; icons: ServiceIcons; costs?: CostReport }) {
  const themeControls = useTheme()
  const { diagramProps, detailsProps, costWindowProps } = useReport(graph, icons, costs)
  const [costMaximized, setCostMaximized] = useState<boolean>()
  const [compactInspector, setCompactInspector] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const costToggle = useRef<HTMLButtonElement>(null)
  const maximized = costMaximized ?? window.matchMedia('(max-height: 520px)').matches
  const showMaximized = Boolean(costWindowProps?.open && maximized)
  const inspectorModal = compactInspector && detailsProps.inspector.pages.length > 0 && !showMaximized

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 639px)')
    const update = () => setCompactInspector(viewport.matches)
    viewport.addEventListener('change', update)
    return () => viewport.removeEventListener('change', update)
  }, [])

  return (
    <Diagram
      {...diagramProps}
      toolbar={{ ...diagramProps.toolbar, ...themeControls }}
      inspector={<DetailsDialog {...detailsProps} compact={compactInspector} suspended={showMaximized} />}
      inspectorModal={inspectorModal}
      costMaximized={showMaximized}
      costControl={costWindowProps && {
        ref: costToggle,
        open: costWindowProps.open,
        toggle: () => costWindowProps.setOpen(!costWindowProps.open),
      }}
      costs={costWindowProps && <CostWindow
        {...costWindowProps}
        inert={inspectorModal}
        maximized={maximized}
        onMaximize={() => setCostMaximized(!maximized)}
        onClose={() => {
          costWindowProps.setOpen(false)
          costToggle.current?.focus()
        }}
      />}
    />
  )
}
