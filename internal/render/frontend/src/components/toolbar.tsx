import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { SlidersHorizontal } from 'lucide-react'
import { useToolbar } from '../hooks/use-toolbar'
import { cn } from '../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { DiagramFilters } from './diagram-filters'
import { Logo } from './Logo'
import { ResourceSearch } from './resource-search'
import { toolbarStyles as styles } from './toolbar.variants'

export const Toolbar = (props: Parameters<typeof useToolbar>[0]) => {
  const { simulated, provenance, modes, filtersOpen, toggleFilters, filterProps, searchProps } =
    useToolbar(props)

  return (
    <>
      <Box aria-label="Diagram tools" className={cn(styles.panel, styles.toolbar)}>
        <Box className={styles.brand}>
          <Logo />
          <Badge
            id="provenance"
            variant="secondary"
            className={cn(styles.provenance, simulated && styles.simulation)}
          >
            {provenance}
          </Badge>
        </Box>
        <ResourceSearch {...searchProps} />
        <Box className={styles.actions}>
          <Box role="group" aria-label="View" className={styles.modes}>
            {modes.map(({ id, label, pressed, variant, onClick }) => (
              <Button
                key={id}
                id={id}
                size="sm"
                variant={variant}
                aria-pressed={pressed}
                className={styles.modeButton}
                onClick={onClick}
              >
                {label}
              </Button>
            ))}
          </Box>
          <Button
            id="filter-button"
            variant="ghost"
            size="icon-lg"
            aria-label="Filters and legend"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={toggleFilters}
          >
            <Icon icon={SlidersHorizontal} />
          </Button>
        </Box>
      </Box>
      <DiagramFilters {...filterProps} />
    </>
  )
}
