import type { EvidenceGroup } from '../../lib/inspector.types'

import { Fragment } from 'react'
import { inspectorStyles as styles } from './inspector.variants'

export const Evidence = ({ groups }: { groups: EvidenceGroup[] }) =>
  groups.map(({ key, label, details, entries }) => (
    <Fragment key={key}>
      {label && <h4 className={styles.evidenceTitle}>{label}</h4>}
      {details && <p className={styles.evidenceDetails}>{details}</p>}
      <ul className={styles.evidenceList}>
        {entries.map(({ source, resource, property }, index) => (
          <li key={index}>
            {source}
            {resource && <div>Configured by: {resource}</div>}
            <code className={styles.evidenceProperty}>{property}</code>
          </li>
        ))}
      </ul>
    </Fragment>
  ))
