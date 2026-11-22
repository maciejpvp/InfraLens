import type { RefObject } from 'react'

import { Minus, Plus } from 'lucide-react'
import { useMapControls } from '../../hooks/use-map-controls'
import { cn } from '../../lib/utils'
import { Button } from '../../ui/button'
import { toolbarStyles as styles } from './toolbar.variants'

export const MapControls = ({
  graph,
  current,
  routes,
  zoomLabel,
  zoom,
  fit,
}: Parameters<typeof useMapControls>[0] & {
  zoomLabel: RefObject<HTMLOutputElement | null>
  fit: () => void
}) => {
  const { summary, omitted, zoomIn, zoomOut } = useMapControls({ graph, current, routes, zoom })
  return (
    <>
      <div role="group" aria-label="Zoom" className={cn(styles.panel, styles.zoom)}>
        <Button id="zoom-out" size="icon-lg" variant="ghost" aria-label="Zoom out" onClick={zoomOut}>
          <Minus />
        </Button>
        <output id="zoom-label" ref={zoomLabel} className={styles.zoomLabel}>
          100%
        </output>
        <Button id="zoom-in" size="icon-lg" variant="ghost" aria-label="Zoom in" onClick={zoomIn}>
          <Plus />
        </Button>
        <Button id="fit" size="sm" className={styles.fitButton} onClick={fit}>
          Fit
        </Button>
      </div>
      <div className={styles.summary}>
        <span id="summary">{summary}</span>
        {omitted && (
          <span id="omitted" className={styles.omitted}>
            {omitted}
          </span>
        )}
      </div>
    </>
  )
}
