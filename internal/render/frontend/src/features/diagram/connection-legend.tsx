import { ChevronDown, ChevronUp, Pause, Play } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useRef, useState } from 'react'
import { overlayPanelClass } from '../../components/overlay-styles'
import type { ProjectedEdge } from '../../lib/graph.types'
import { cn } from '../../lib/utils'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { List } from '../../ui/list'
import { ListItem } from '../../ui/list-item'
import { Text } from '../../ui/text'
import { pipeAppearance, pipeKinds, pipePaint } from './connection-paint'
import type { FlowPaintLayer } from './flow-path'
import { FlowPath } from './flow-path'

const styles = {
  placement:
    'right-2.5 bottom-[max(3.75rem,calc(env(safe-area-inset-bottom)+3.25rem))] w-max max-w-[calc(100%-1.25rem)] p-1.5 sm:right-4',
  header: 'flex items-center gap-1',
  button: 'justify-start gap-2 rounded-full px-2.5 text-xs motion-safe:active:scale-95',
  motion: 'ml-auto rounded-full text-muted-foreground motion-reduce:hidden',
  content: 'px-2.5 pt-1 pb-1.5 motion-safe:animate-detail-in',
  entries: 'grid gap-1',
  entry:
    'flex w-full cursor-pointer items-center gap-2 rounded-sm text-left text-xs leading-tight text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[pressed=false]:text-muted-foreground aria-[pressed=false]:grayscale',
  sample: 'pointer-events-none h-3.5 w-12 shrink-0',
  note: 'mt-2 text-[.625rem] leading-snug text-muted-foreground',
}

const legendEntries = pipeKinds.map((kind) => ({
    kind,
    label: pipeAppearance[kind].label,
    ...pipePaint[kind],
  }))

export function ConnectionLegend({
  legendOpen,
  legendRef,
  playing,
  hiddenKinds,
  setKindVisible,
  motionAction,
  toggleLegend,
  toggleMotion,
}: ReturnType<typeof useConnectionLegend>) {
  return (
    <Box
      as="section"
      ref={legendRef}
      aria-label="Connection legend"
      className={cn(overlayPanelClass, styles.placement)}
    >
      <Box className={styles.header}>
        <Button
          variant="ghost"
          size="sm"
          className={styles.button}
          aria-expanded={legendOpen}
          aria-controls="connection-legend"
          onClick={toggleLegend}
        >
          Connection legend
          <Icon icon={legendOpen ? ChevronDown : ChevronUp} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={styles.motion}
          aria-label={motionAction}
          title={motionAction}
          onClick={toggleMotion}
        >
          <Icon icon={playing ? Pause : Play} />
        </Button>
      </Box>
      <Box id="connection-legend" hidden={!legendOpen} className={styles.content}>
        <List className={styles.entries}>
          {legendEntries.map(({ kind, label, ...paint }) => {
            const visible = !hiddenKinds.has(kind)
            return (
              <ListItem key={kind}>
                <Button
                  type="button"
                  unstyled
                  className={styles.entry}
                  aria-pressed={visible}
                  data-connection-kind={kind}
                  data-pipe-motion={visible ? undefined : 'off'}
                  onClick={() => setKindVisible(kind, !visible)}
                >
                  <FlowSwatch className={styles.sample} {...paint} />
                  <Text>{label}</Text>
                </Button>
              </ListItem>
            )
          })}
        </List>
        <Text as="p" className={styles.note}>
          Configuration only. No live traffic.
        </Text>
      </Box>
    </Box>
  )
}

function FlowSwatch({
  wire,
  underlay,
  stream,
  className,
}: {
  wire: CSSProperties
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
  className?: string
}) {
  return (
    <svg className={className} viewBox="0 0 48 14" aria-hidden="true">
      <FlowPath path="M4 7H40" style={wire} interactionWidth={0} underlay={underlay} stream={stream} />
      <path d="M39 3.5L45 7L39 10.5Z" fill={wire.stroke} />
    </svg>
  )
}

type ConnectionKind = ProjectedEdge['kind']

export const useConnectionLegend = () => {
  const [legendOpen, setLegendOpen] = useState(
    () => window.matchMedia('(min-width: 621px)').matches,
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
