import { Minus, Plus } from 'lucide-react'
import type { RefObject } from 'react'
import { overlayPanelClass } from '../../components/overlay-styles'
import { countChanges, countLabel } from '../../lib/graph-view'
import type { Graph } from '../../lib/graph.types'
import type { Route } from './layout/layout-model'
import { cn } from '../../lib/utils'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { Text } from '../../ui/text'

const styles = {
  zoom: 'bottom-[max(.75rem,env(safe-area-inset-bottom))] left-2.5 flex items-center p-1 sm:left-4',
  zoomLabel: 'min-w-12 text-center text-xs text-muted-foreground tabular-nums',
  controlButton: 'rounded-full motion-safe:active:scale-95',
  fitButton: 'ml-1 rounded-full motion-safe:active:scale-95',
  summary:
    'pointer-events-none absolute right-3 bottom-4 max-w-[calc(100%-13rem)] rounded-full border bg-card/90 px-2.5 py-2 text-[.625rem] text-muted-foreground sm:right-4 sm:text-xs',
  omitted: 'ml-2 hidden lg:inline',
}

type MapControlsProps = {
  graph: Graph
  flowCount?: number
  routes: (Route | null)[]
  zoomLabel: RefObject<HTMLOutputElement | null>
  fit: () => void
  zoom: (factor: number) => void
}

export function MapControls({
  graph,
  flowCount,
  routes,
  zoomLabel,
  zoom,
  fit,
}: MapControlsProps) {
  const { summary, omitted } = describeDiagram({ graph, flowCount, routes })
  return (
    <>
      <Box role="group" aria-label="Zoom" className={cn(overlayPanelClass, styles.zoom)}>
        <Button
          id="zoom-out"
          size="icon-lg"
          variant="ghost"
          className={styles.controlButton}
          aria-label="Zoom out"
          onClick={() => zoom(1.25)}
        >
          <Icon icon={Minus} />
        </Button>
        <Text as="output" id="zoom-label" ref={zoomLabel} className={styles.zoomLabel}>
          100%
        </Text>
        <Button
          id="zoom-in"
          size="icon-lg"
          variant="ghost"
          className={styles.controlButton}
          aria-label="Zoom in"
          onClick={() => zoom(0.8)}
        >
          <Icon icon={Plus} />
        </Button>
        <Button id="fit" size="sm" className={styles.fitButton} onClick={fit}>
          Fit
        </Button>
      </Box>
      <Box className={styles.summary}>
        <Text id="summary">{summary}</Text>
        {omitted && (
          <Text id="omitted" className={styles.omitted}>
            {omitted}
          </Text>
        )}
      </Box>
    </>
  )
}

const describeDiagram = ({ graph, flowCount, routes }: Pick<MapControlsProps, 'graph' | 'flowCount' | 'routes'>) => {
  const missing = routes.filter((route) => !route).length
  const counts = flowCount === undefined
    ? [countLabel(graph.nodes.length, 'resource'), countChanges(graph.nodes)]
    : [`${flowCount} in flow`, `${graph.nodes.length} total`]

  return {
    summary: [...counts, missing ? `unrouted: ${missing}` : ''].filter(Boolean).join(' · '),
    omitted: (graph.omittedRelations ?? 0) > 0 ? `Omitted references: ${graph.omittedRelations}` : '',
  }
}
