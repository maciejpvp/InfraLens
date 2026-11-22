import { Box } from '../ui/box'
import { Label } from '../ui/label'
import { List } from '../ui/list'
import { ListItem } from '../ui/list-item'
import { Text } from '../ui/text'
import type { useToolbar } from '../hooks/use-toolbar'

import { cn } from '../lib/utils'
import { Checkbox } from '../ui/checkbox'
import { NativeSelect } from '../ui/native-select'
import { NativeSelectOption } from '../ui/native-select-option'
import { relationLegend, topologyOptions } from './toolbar.config'
import { toolbarStyles as styles } from './toolbar.variants'

export const DiagramFilters = ({
  filtersOpen,
  dependencies,
  dependenciesDisabled,
  setDependencies,
  showTopology,
  topology,
  changeTopology,
  simulated,
}: ReturnType<typeof useToolbar>['filterProps']) => (
  <Box
    as="section"
    id="filters"
    aria-label="Filters and legend"
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
      <Label htmlFor="dependencies">Pulumi deployment dependencies</Label>
    </Box>
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
    <List className={styles.legend}>
      {relationLegend.map(({ kind, label }) => (
        <ListItem key={kind} className={styles.legendItem}>
          <Text className={styles.legendLine[kind]} />
          {label}
        </ListItem>
      ))}
    </List>
    <Text as="p" className={styles.note}>
      Arrows describe configuration, not observed traffic. A Pulumi dependency does not determine data
      direction.
    </Text>
    <Text as="p" id="simulation-note" hidden={!simulated} className={styles.simulationNote}>
      Simulation uses mocked provider responses. “+ create” means comparison with an empty state.
    </Text>
  </Box>
)
