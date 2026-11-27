import { SlidersHorizontal, Sun } from 'lucide-react'
import type { RefObject } from 'react'
import lockupDark from '../../assets/brand/lockup-dark.svg?inline'
import lockupLight from '../../assets/brand/lockup-light.svg?inline'
import logoDark from '../../assets/brand/logo-dark.svg?inline'
import logoLight from '../../assets/brand/logo-light.svg?inline'
import type { useTheme } from '../../hooks/use-theme'
import { overlayPanelClass, segmentButtonClass, segmentedControlClass } from '../../components/overlay-styles'
import { topologyNames } from '../../lib/graph-view'
import { cn } from '../../lib/utils'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Icon } from '../../ui/icon'
import { Image } from '../../ui/image'
import { Label } from '../../ui/label'
import { NativeSelect } from '../../ui/native-select'
import { NativeSelectOption } from '../../ui/native-select-option'
import { Text } from '../../ui/text'
import { SegmentButton } from '../../components/segment-button'
import { ResourceSearch } from './resource-search'
import type { ToolbarOptions } from './use-toolbar'
import { useToolbar } from './use-toolbar'

const styles = {
  toolbar:
    'report-toolbar relative z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b bg-card px-3 max-[700px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[700px]:gap-1 max-[700px]:px-2',
  brand: 'flex min-w-0 items-center gap-3',
  context: 'min-w-0 truncate border-l pl-3 text-xs text-muted-foreground max-[700px]:hidden',
  provenance: 'flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground max-[900px]:hidden',
  actions: 'flex min-w-0 items-center justify-end gap-1.5 max-[700px]:gap-0.5',
  filters: 'top-full right-2 mt-1 w-[min(320px,calc(100%-1rem))] space-y-3 p-3 text-sm',
  dependencies: 'flex items-center gap-2',
  topology: 'space-y-1.5',
  note: 'text-xs text-muted-foreground',
}
const topologyOptions = [
  { value: 'after', label: topologyNames.after },
  { value: 'before', label: topologyNames.before },
]

export function Toolbar({ onClearWorkflow, onExitDetailsView, theme, toggleTheme, costControl, inert, ...props }: ToolbarOptions & ReturnType<typeof useTheme> & {
  onClearWorkflow?: () => void
  onExitDetailsView?: () => void
  costControl?: { ref: RefObject<HTMLButtonElement | null>; open: boolean; toggle: () => void }
  inert: boolean
}) {
  const { stacks, provenance, modes, filtersOpen, toggleFilters, filterProps, searchProps } = useToolbar(props)
  const context = stacks.length > 1 ? `${stacks.length} stacks` : stacks[0] ?? 'Infrastructure report'
  const scopeAction = onClearWorkflow ?? onExitDetailsView

  return (
    <Box as="header" aria-label="Diagram tools" className={styles.toolbar} inert={inert}>
      <Box className={styles.brand}>
        <Image className="block h-5 w-auto shrink-0 min-[700px]:hidden" src={theme === 'dark' ? logoDark : logoLight} alt="Laytrace" />
        <Image className="hidden h-5 w-auto shrink-0 min-[700px]:block" src={theme === 'dark' ? lockupDark : lockupLight} alt="Laytrace" />
        <Text className={styles.context} title={stacks.join(', ') || context}>{context}</Text>
        <Text id="provenance" className={styles.provenance}>
          <span className={cn('size-1.5 rounded-full bg-primary', filterProps.simulated && 'bg-cost-warning')} aria-hidden="true" />
          {provenance}
        </Text>
      </Box>
      <Box className="flex items-center justify-self-center gap-1.5 max-[700px]:gap-1">
        <Box role="group" aria-label="Graph mode" className={segmentedControlClass}>
          {modes.map(({ id, label, pressed, onClick }) => (
            <SegmentButton key={id} id={id} size="sm" group="graph-mode" pressed={pressed} onClick={onClick}>
              {label}
            </SegmentButton>
          ))}
        </Box>
        {costControl && (
          <Button ref={costControl.ref} id="cost-toggle" type="button" size="sm"
            variant={costControl.open ? 'secondary' : 'outline'} className={segmentButtonClass}
            aria-pressed={costControl.open} aria-controls={costControl.open ? 'report-cost-window' : undefined} onClick={costControl.toggle}>
            Costs
          </Button>
        )}
        {scopeAction && (
          <Button id={onClearWorkflow ? undefined : 'exit-details-view'} type="button" size="sm" variant="ghost"
            className="h-7 gap-1 px-2 max-lg:hidden" onClick={scopeAction}>
            {onClearWorkflow ? 'Exit workflow' : 'Exit Details View'}
          </Button>
        )}
      </Box>
      <Box className={styles.actions}>
        <ResourceSearch {...searchProps} />
        <Button id="filter-button" variant="ghost" size="icon-sm"
          aria-label="Diagram filters" title="Diagram filters" aria-expanded={filtersOpen} aria-controls="filters" onClick={toggleFilters}>
          <Icon icon={SlidersHorizontal} />
        </Button>
        <Button id="theme-toggle" variant="ghost" size="icon-sm" className="max-[360px]:hidden"
          aria-label="Light mode" aria-pressed={theme === 'light'} title="Light mode" onClick={toggleTheme}>
          <Icon icon={Sun} />
        </Button>
      </Box>
      <DiagramFilters {...filterProps} showTopology={filterProps.showTopology && !onExitDetailsView}
        scopeAction={scopeAction} workflow={Boolean(onClearWorkflow)} theme={theme} toggleTheme={toggleTheme} />
    </Box>
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
  scopeAction,
  workflow,
  theme,
  toggleTheme,
}: ReturnType<typeof useToolbar>['filterProps'] & ReturnType<typeof useTheme> & {
  scopeAction?: () => void
  workflow: boolean
}) {
  return (
    <Box
      as="section"
      id="filters"
      aria-label="Diagram filters"
      data-motion-popover hidden={!filtersOpen} inert={!filtersOpen}
      className={cn(overlayPanelClass, styles.filters)}
    >
      <Text as="h2" className="font-semibold">
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
      {scopeAction && <Button type="button" size="sm" variant="outline" className="lg:hidden" onClick={scopeAction}>
        {workflow ? 'Exit workflow' : 'Exit Details View'}
      </Button>}
      <Button type="button" size="sm" variant="ghost" className="min-[361px]:hidden"
        aria-pressed={theme === 'light'} onClick={toggleTheme}><Icon icon={Sun} /> Light mode</Button>
      <Text as="p" className={styles.note}>
        Deployment dependencies show ordering without implying a direction for data flow.
      </Text>
      <Text as="p" id="simulation-note" hidden={!simulated} className={styles.note}>
        Simulation uses mocked provider responses. “+ create” means comparison with an empty state.
      </Text>
    </Box>
  )
}
