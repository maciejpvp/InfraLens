import type { useToolbar } from '../../hooks/use-toolbar'

import { cn } from '../../lib/utils'
import { Checkbox } from '../../ui/checkbox'
import { NativeSelect } from '../../ui/native-select'
import { NativeSelectOption } from '../../ui/native-select-option'
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
  <section
    id="filters"
    aria-label="Filters and legend"
    hidden={!filtersOpen}
    className={cn(styles.panel, styles.filters)}
  >
    <h2 className={styles.filterTitle}>Diagram view</h2>
    <div className={styles.dependencies}>
      <Checkbox
        id="dependencies"
        checked={dependencies}
        disabled={dependenciesDisabled}
        onCheckedChange={setDependencies}
      />
      <label htmlFor="dependencies">Pulumi deployment dependencies</label>
    </div>
    <div id="topology-label" hidden={!showTopology} className={styles.topology}>
      <label htmlFor="topology">Connections</label>
      <NativeSelect id="topology" value={topology} onChange={changeTopology}>
        {topologyOptions.map(({ value, label }) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
    <ul className={styles.legend}>
      {relationLegend.map(({ kind, label }) => (
        <li key={kind} className={styles.legendItem}>
          <span className={styles.legendLine[kind]} />
          {label}
        </li>
      ))}
    </ul>
    <p className={styles.note}>
      Arrows describe configuration, not observed traffic. A Pulumi dependency does not determine data
      direction.
    </p>
    <p id="simulation-note" hidden={!simulated} className={styles.simulationNote}>
      Simulation uses mocked provider responses. “+ create” means comparison with an empty state.
    </p>
  </section>
)
