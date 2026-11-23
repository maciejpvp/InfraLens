import { List } from '../ui/list'
import { Text } from '../ui/text'
import type { MetadataRow } from '../lib/inspector.types'

import { Box } from '../ui/box'
import { ServiceIcon } from './service-icon'
import { inspectorStyles as styles } from './inspector.variants'

export const Metadata = ({ rows }: { rows: MetadataRow[] }) => (
  <List as="dl" className={styles.metadata}>
    {rows.map(([label, value, icon]) => (
      <Box key={label} className={styles.metadataRow}>
        <Text as="dt" className={styles.metadataLabel}>
          {icon !== undefined && <ServiceIcon icon={icon} />}
          {label}
        </Text>
        <Text as="dd" className={styles.metadataValue}>
          {value}
        </Text>
      </Box>
    ))}
  </List>
)
