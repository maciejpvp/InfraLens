import type { ServiceIcons } from '../lib/graph.types'

import { Box } from '../ui/box'
import { useResourceDetails } from '../hooks/use-resource-details'
import { Accordion } from '../ui/accordion'
import { DetailRow } from './detail-row'
import { DetailSection } from './detail-section'
import { DependencyGroups } from './dependency-groups'
import { RelationRows } from './relation-rows'
import { Metadata } from './metadata'
import { inspectorStyles as styles } from './inspector.variants'

export const ResourceDetails = ({ icons, ...props }: Parameters<typeof useResourceDetails>[0] & { icons: ServiceIcons }) => {
  const { rows, resourceGroup, relations, toRow } = useResourceDetails(props)
  return (
    <>
      <Metadata rows={rows} />
      <Accordion type="multiple" className={styles.sections}>
        {resourceGroup && (
          <DetailSection value="members" title={resourceGroup.title}>
            <Box className={styles.rows}>
              {resourceGroup.entries.map(({ id, ...entry }) => (
                <DetailRow key={id} {...entry} />
              ))}
            </Box>
          </DetailSection>
        )}
        {relations.map(({ kind, title, edges }) => (
          <DetailSection key={kind} value={kind} title={title}>
            {kind === 'depends_on' ? (
              <DependencyGroups edges={edges} byId={props.byId} icons={icons}>
                {(group) => <RelationRows edges={group} toRow={toRow} />}
              </DependencyGroups>
            ) : <RelationRows edges={edges} toRow={toRow} />}
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
