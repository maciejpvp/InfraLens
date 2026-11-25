import { SlidersHorizontal } from 'lucide-react'
import logoSource from '../../assets/infralens-logo.svg?inline'
import { overlayPanelClass, segmentButtonClass, segmentedControlClass } from '../../components/overlay-styles'
import { topologyNames } from '../../lib/graph-view'
import { cn } from '../../lib/utils'
import { Badge } from '../../ui/badge'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Icon } from '../../ui/icon'
import { Image } from '../../ui/image'
import { Label } from '../../ui/label'
import { NativeSelect } from '../../ui/native-select'
import { NativeSelectOption } from '../../ui/native-select-option'
import { Text } from '../../ui/text'
import { ResourceSearch } from './resource-search'
import type { ToolbarOptions } from './use-toolbar'
import { useToolbar } from './use-toolbar'

const styles = {
  toolbar:
    'inset-x-2.5 top-2.5 flex min-h-15 flex-wrap items-center justify-between gap-2 p-2 min-[621px]:inset-x-4 min-[621px]:top-[max(1rem,env(safe-area-inset-top))] min-[621px]:flex-nowrap min-[621px]:gap-3',
  brand: 'flex shrink-0 items-center gap-2',
  provenance: 'text-[.6rem] sm:text-xs',
  simulation: 'border-amber-700/50 bg-amber-950 text-amber-200',
  actions: 'flex shrink-0 items-center gap-1',
  filters:
    'right-2.5 top-30 max-h-[calc(100dvh-10rem)] w-[min(330px,calc(100%-1.25rem))] overflow-auto p-5 text-sm min-[621px]:right-4 min-[621px]:top-22',
  filterTitle: 'mb-4 font-semibold',
  dependencies: 'flex items-center gap-2',
  topology: 'mt-4 space-y-2',
  note: 'text-muted-foreground',
  simulationNote: 'mt-3 text-muted-foreground',
}
const logoStyles = {
  root: 'flex shrink-0 items-center gap-2',
  mark: 'size-6 shrink-0',
  name: 'sr-only font-semibold tracking-tight lg:not-sr-only',
}

const topologyOptions = [
  { value: 'after', label: topologyNames.after },
  { value: 'before', label: topologyNames.before },
]

export function Toolbar({ onClearWorkflow, onExitDetailsView, ...props }: ToolbarOptions & {
  onClearWorkflow?: () => void
  onExitDetailsView?: () => void
}) {
  const { simulated, provenance, modes, filtersOpen, toggleFilters, filterProps, searchProps } =
    useToolbar(props)

  return (
    <>
      <Box aria-label="Diagram tools" className={cn(overlayPanelClass, styles.toolbar)}>
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
          <Box role="group" aria-label="View" className={segmentedControlClass}>
            {onClearWorkflow || onExitDetailsView ? (
              <Button id={onClearWorkflow ? undefined : 'exit-details-view'} type="button" size="sm" variant="ghost" className={segmentButtonClass} onClick={onClearWorkflow ?? onExitDetailsView}>
                {onClearWorkflow ? 'Exit workflow' : 'Exit Details View'}
              </Button>
            ) : modes.map(({ id, label, pressed, variant, onClick }) => (
              <Button
                key={id}
                id={id}
                size="sm"
                variant={variant}
                aria-pressed={pressed}
                className={segmentButtonClass}
                onClick={onClick}
              >
                {label}
              </Button>
            ))}
          </Box>
          <Button
            id="filter-button"
            className="rounded-full motion-safe:active:scale-95"
            variant="ghost"
            size="icon-lg"
            aria-label="Diagram filters"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={toggleFilters}
          >
            <Icon icon={SlidersHorizontal} />
          </Button>
        </Box>
      </Box>
      <DiagramFilters {...filterProps} showTopology={filterProps.showTopology && !onExitDetailsView} />
    </>
  )
}

function DiagramFilters({
  filtersOpen,
  dependencies,
  dependenciesDisabled,
  connectionScope,
  setDependencies,
  showTopology,
  topology,
  changeTopology,
  simulated,
}: ReturnType<typeof useToolbar>['filterProps']) {
  return (
    <Box
      as="section"
      id="filters"
      aria-label="Diagram filters"
      hidden={!filtersOpen}
      className={cn(overlayPanelClass, styles.filters)}
    >
      <Text as="h2" className={styles.filterTitle}>
        Diagram view
      </Text>
      <Box className={styles.dependencies}>
        <Checkbox
          id="dependencies"
          checked={dependencies}
          disabled={dependenciesDisabled}
          onCheckedChange={setDependencies}
        />
        <Label htmlFor="dependencies">Deployment dependencies</Label>
      </Box>
      {connectionScope && (
        <Box className={styles.dependencies}>
          <Checkbox
            id="resource-connections"
            checked={connectionScope.checked}
            onCheckedChange={(checked) => connectionScope.change(checked === true)}
          />
          <Label htmlFor="resource-connections">Show only connections to this selection</Label>
        </Box>
      )}
      <Box id="topology-label" hidden={!showTopology} className={styles.topology}>
        <Label htmlFor="topology">Connections</Label>
        <NativeSelect id="topology" value={topology} onChange={changeTopology}>
          {topologyOptions.map(({ value, label }) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Box>
      <Text as="p" className={styles.note}>
        Deployment dependencies show ordering without implying a direction for data flow.
      </Text>
      <Text as="p" id="simulation-note" hidden={!simulated} className={styles.simulationNote}>
        Simulation uses mocked provider responses. “+ create” means comparison with an empty state.
      </Text>
    </Box>
  )
}

function Logo() {
  return (
    <Box className={logoStyles.root}>
      <Image className={logoStyles.mark} src={logoSource} alt="" />
      <Text className={logoStyles.name}>InfraLens</Text>
    </Box>
  )
}
