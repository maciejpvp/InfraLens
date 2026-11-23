import { ChevronDown, ChevronUp, Pause, Play } from 'lucide-react'
import type { useConnectionLegend } from '../hooks/use-connection-legend'
import { cn } from '../lib/utils'
import { Box } from '../ui/box'
import { Button } from '../ui/button'
import { FlowSwatch } from '../ui/flow-swatch'
import { Icon } from '../ui/icon'
import { List } from '../ui/list'
import { ListItem } from '../ui/list-item'
import { Text } from '../ui/text'
import { connectionLegendConfig } from './connection-legend.config'
import { connectionLegendStyles as styles } from './connection-legend.variants'
import { toolbarStyles } from './toolbar.variants'

export const ConnectionLegend = ({
  legendOpen,
  legendRef,
  playing,
  hiddenKinds,
  setKindVisible,
  motionAction,
  toggleLegend,
  toggleMotion,
}: ReturnType<typeof useConnectionLegend>) => (
  <Box
    as="section"
    ref={legendRef}
    aria-label="Connection legend"
    className={cn(toolbarStyles.panel, styles.placement)}
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
        {connectionLegendConfig.entries.map(({ kind, label, ...paint }) => {
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
