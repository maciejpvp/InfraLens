import { Box } from '../ui/box'
import { Label } from '../ui/label'
import { Text } from '../ui/text'
import type { useToolbar } from '../hooks/use-toolbar'

import { cn } from '../lib/utils'
import { Checkbox } from '../ui/checkbox'
import { NativeSelect } from '../ui/native-select'
import { NativeSelectOption } from '../ui/native-select-option'
import { topologyOptions } from './toolbar.config'
import { toolbarStyles as styles } from './toolbar.variants'

export const DiagramFilters = ({
  filtersOpen,
  dependencies,
  dependenciesDisabled,
  connectionScope,
  setDependencies,
  showTopology,
  topology,
  changeTopology,
  simulated,
}: ReturnType<typeof useToolbar>['filterProps']) => (
  <Box
    as="section"
    id="filters"
    aria-label="Diagram filters"
    hidden={!filtersOpen}
    className={cn(styles.panel, styles.filters)}
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
        <Label htmlFor="resource-connections">Show only this resource’s connections</Label>
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
