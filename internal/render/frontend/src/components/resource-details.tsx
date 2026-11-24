import type { GraphEdge, ServiceIcons } from '../lib/graph.types'
import type { Endpoint } from '../lib/relation-groups'

import { ChevronRight } from 'lucide-react'
import { changeLabels } from '../lib/graph-view.config'
import { inspectorServiceIconSrc } from '../lib/graph-view'
import { serviceFor } from '../lib/graph-projection'
import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { Text } from '../ui/text'
import { useResourceDetails } from '../hooks/use-resource-details'
import { Accordion } from '../ui/accordion'
import { DetailRow } from './detail-row'
import { DetailSection } from './detail-section'
import { DependencyGroups } from './dependency-groups'
import { RelationGroups } from './relation-groups'
import { RelationRows } from './relation-rows'
import { Metadata } from './metadata'
import { ResourceName } from './resource-name'
import { ServiceIcon } from './service-icon'
import { inspectorStyles as styles } from './inspector.variants'

export const ResourceDetails = ({ icons, ...props }: Parameters<typeof useResourceDetails>[0] & { icons: ServiceIcons }) => {
  const { byId } = props
  const { rows, resourceGroup, relations, toRow } = useResourceDetails(props)
  const renderRows = (edges: GraphEdge[], shared?: Endpoint) => (
    <RelationRows edges={edges} byId={byId} icons={icons} shared={shared} toRow={toRow} />
  )
  return (
    <>
      <Metadata rows={rows} />
      <Accordion type="multiple" className={styles.sections}>
        {resourceGroup && (
          <DetailSection value="members" title={resourceGroup.title}>
            <Box className={styles.rows}>
              {resourceGroup.entries.map(({ id, resource, onClick }) => (
                <DetailRow key={id} onClick={onClick}>
                  <Text className={styles.memberRow}>
                    <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(resource), icons)} />
                    <Text className="min-w-0">
                      <Text data-member-id={id} className={styles.rowName}>
                        <ResourceName name={resource.name} />
                      </Text>
                      <Text className={styles.rowCaption}>
                        {resource.type}
                        {resource.change && resource.change !== 'unchanged' && ` · ${changeLabels[resource.change]}`}
                      </Text>
                    </Text>
                    <Icon icon={ChevronRight} className="size-4 text-muted-foreground" />
                  </Text>
                </DetailRow>
              ))}
            </Box>
          </DetailSection>
        )}
        {relations.map(({ kind, title, edges }) => (
          <DetailSection key={kind} value={kind} title={title}>
            {kind === 'depends_on' ? (
              <DependencyGroups edges={edges} byId={byId} icons={icons}>
                {renderRows}
              </DependencyGroups>
            ) : kind === 'triggers' || kind === 'connects_to' ? (
              <RelationGroups edges={edges} byId={byId} icons={icons}>
                {renderRows}
              </RelationGroups>
            ) : renderRows(edges)}
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
