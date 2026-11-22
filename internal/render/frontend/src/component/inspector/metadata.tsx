import type { MetadataRow } from '../../lib/inspector.types'

import { Fragment } from 'react'
import { inspectorStyles as styles } from './inspector.variants'

export const Metadata = ({ rows }: { rows: MetadataRow[] }) => (
  <dl className={styles.metadata}>
    {rows.map(([label, value]) => (
      <Fragment key={label}>
        <dt className={styles.metadataLabel}>{label}</dt>
        <dd>{value}</dd>
      </Fragment>
    ))}
  </dl>
)
