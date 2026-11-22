import { List } from '../ui/list'
import { Text } from '../ui/text'
import type { MetadataRow } from '../lib/inspector.types'

import { Fragment } from 'react'
import { inspectorStyles as styles } from './inspector.variants'

export const Metadata = ({ rows }: { rows: MetadataRow[] }) => (
  <List as="dl" className={styles.metadata}>
    {rows.map(([label, value]) => (
      <Fragment key={label}>
        <Text as="dt" className={styles.metadataLabel}>
          {label}
        </Text>
        <Text as="dd">{value}</Text>
      </Fragment>
    ))}
  </List>
)
