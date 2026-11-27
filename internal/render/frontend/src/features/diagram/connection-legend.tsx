import { ChevronUp } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import type { ProjectedEdge } from '../../lib/graph.types'
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
  placement: 'relative justify-self-center',
  trigger: 'text-muted-foreground min-[981px]:hidden',
  content: 'connection-legend-content items-center gap-1 text-xs text-muted-foreground',
  entries: 'flex items-center gap-2 max-[980px]:flex-col max-[980px]:items-stretch max-[980px]:gap-1',
  entry:
    'flex min-h-6 w-full cursor-pointer items-center gap-1.5 rounded-sm px-1 text-left text-xs whitespace-nowrap hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[pressed=false]:line-through aria-[pressed=false]:grayscale',
  sample: 'pointer-events-none h-3 w-8 shrink-0',
  note: 'text-xs text-muted-foreground min-[981px]:sr-only',
}

const legendEntries = pipeKinds.map((kind) => ({
  kind,
  label: pipeAppearance[kind].label,
  ...pipePaint[kind],
}))

export function ConnectionLegend({
  legendOpen,
  hiddenKinds,
  setKindVisible,
  toggleLegend,
}: ReturnType<typeof useConnectionLegend>) {
  return (
    <Box as="section" aria-label="Connection legend" className={styles.placement}
      data-open={legendOpen} onBlur={(event) => {
        if (legendOpen && !event.currentTarget.contains(event.relatedTarget)) toggleLegend()
      }}>
      <Button variant="ghost" size="xs" className={styles.trigger} aria-expanded={legendOpen}
        aria-controls="connection-legend" onClick={toggleLegend}>
        Legend <Icon icon={ChevronUp} />
      </Button>
      <Box id="connection-legend" className={styles.content} onKeyDown={(event) => {
        if (event.key === 'Escape' && legendOpen) {
          event.stopPropagation()
          toggleLegend()
          const trigger = event.currentTarget.previousElementSibling
          if (trigger instanceof HTMLElement) trigger.focus()
        }
      }}>
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
  const [legendOpen, setLegendOpen] = useState(false)
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
    hiddenKinds,
    setKindVisible,
    toggleLegend: () => setLegendOpen((open) => !open),
  }
}
