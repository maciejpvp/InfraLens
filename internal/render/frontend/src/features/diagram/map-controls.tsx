import { Minus, Plus } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { Text } from '../../ui/text'

const styles = {
  bar: 'report-status relative z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t bg-card px-3 text-xs text-muted-foreground max-[980px]:grid-cols-[minmax(0,1fr)_auto_auto] max-sm:px-2',
  summary: 'min-w-0 truncate tabular-nums',
  zoom: 'flex items-center justify-self-end',
  zoomLabel: 'min-w-11 text-center tabular-nums',
}

type MapControlsProps = {
  provider?: string
  visible: number
  total: number
  omitted?: number
  unrouted?: number
  disabled: boolean
  inert?: boolean
  zoomLabel: RefObject<HTMLOutputElement | null>
  fit: () => void
  zoom: (factor: number) => void
  children?: ReactNode
}

export function MapControls({ provider, visible, total, omitted, unrouted, disabled, inert, zoomLabel, zoom, fit, children }: MapControlsProps) {
  const counts = `${visible} / ${total}`
  const details = [
    provider,
    `${counts} resources`,
    omitted ? `Omitted references: ${omitted}` : '',
    unrouted ? `Unrouted connections: ${unrouted}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <footer className={styles.bar} aria-label="Diagram status" inert={inert}>
      <Box className={styles.summary} title={details} aria-label={details}>
        {provider && <Text className="max-sm:hidden">{provider} <span aria-hidden="true">· </span></Text>}
        <Text id="summary">{counts} <span className="max-sm:hidden">resources</span></Text>
        {omitted ? <Text id="omitted" className="ml-2 max-xl:hidden">Omitted references: {omitted}</Text> : null}
        {unrouted ? <Text className="ml-2 max-xl:hidden">Unrouted connections: {unrouted}</Text> : null}
      </Box>
      {children ?? <Box />}
      <Box role="group" aria-label="Zoom" className={styles.zoom}>
        <Button id="zoom-out" size="icon-xs" variant="ghost" aria-label="Zoom out" title="Zoom out"
          disabled={disabled} onClick={() => zoom(1.25)}>
          <Icon icon={Minus} />
        </Button>
        <Text as="output" id="zoom-label" ref={zoomLabel} className={styles.zoomLabel}>100%</Text>
        <Button id="zoom-in" size="icon-xs" variant="ghost" aria-label="Zoom in" title="Zoom in"
          disabled={disabled} onClick={() => zoom(0.8)}>
          <Icon icon={Plus} />
        </Button>
        <Button id="fit" size="xs" variant="ghost" className="ml-1" disabled={disabled} onClick={fit} title="Fit diagram">
          Fit
        </Button>
      </Box>
    </footer>
  )
}
