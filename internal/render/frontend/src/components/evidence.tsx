import { Box } from '../ui/box'
import { List } from '../ui/list'
import { ListItem } from '../ui/list-item'
import { Text } from '../ui/text'
import type { EvidenceGroup } from '../lib/inspector.types'

import { Fragment } from 'react'
import { inspectorStyles as styles } from './inspector.variants'

export const Evidence = ({ groups }: { groups: EvidenceGroup[] }) =>
  groups.map(({ key, label, details, entries }) => (
    <Fragment key={key}>
      {label && (
        <Text as="h4" className={styles.evidenceTitle}>
          {label}
        </Text>
      )}
      {details && (
        <Text as="p" className={styles.evidenceDetails}>
          {details}
        </Text>
      )}
      <List className={styles.evidenceList}>
        {entries.map(({ source, resource, property }, index) => (
          <ListItem key={index}>
            {source}
            {resource && <Box>Configured by: {resource}</Box>}
            <Text as="code" className={styles.evidenceProperty}>
              {property}
            </Text>
          </ListItem>
        ))}
      </List>
    </Fragment>
  ))
