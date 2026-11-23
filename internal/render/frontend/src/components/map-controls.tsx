import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { Text } from '../ui/text'
import type { RefObject } from 'react'

import { Minus, Plus } from 'lucide-react'
import { useMapControls } from '../hooks/use-map-controls'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { toolbarStyles as styles } from './toolbar.variants'

export const MapControls = ({
  graph,
  flowCount,
  routes,
  zoomLabel,
  zoom,
  fit,
}: Parameters<typeof useMapControls>[0] & {
  zoomLabel: RefObject<HTMLOutputElement | null>
  fit: () => void
}) => {
  const { summary, omitted, zoomIn, zoomOut } = useMapControls({ graph, flowCount, routes, zoom })
  return (
    <>
      <Box role="group" aria-label="Zoom" className={cn(styles.panel, styles.zoom)}>
        <Button
          id="zoom-out"
          size="icon-lg"
          variant="ghost"
          className={styles.controlButton}
          aria-label="Zoom out"
          onClick={zoomOut}
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
          onClick={zoomIn}
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
