import { useMemo, type ReactNode } from 'react'
import type { GraphEdge, ResourcesById, ServiceIcons } from '../lib/graph.types'
import { serviceFor } from '../lib/graph-projection'
import { countLabel, inspectorServiceIconSrc } from '../lib/graph-view'
import { groupBySharedEndpoint, type Endpoint } from '../lib/relation-groups'
import { Accordion } from '../ui/accordion'
import { Box } from '../ui/box'
import { Text } from '../ui/text'
import { DetailSection } from './detail-section'
import { ResourceName } from './resource-name'
import { ServiceIcon } from './service-icon'
import { inspectorStyles as styles } from './inspector.variants'

export const RelationGroups = ({ edges, byId, icons, children }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  children: (edges: GraphEdge[], shared?: Endpoint) => ReactNode
}) => {
  const { shared, singles } = useMemo(() => groupBySharedEndpoint(edges), [edges])
  if (!shared.length) return children(singles)

  return (
    <Box className={styles.sections}>
      <Accordion type="multiple" className={styles.sections}>
        {shared.map(({ key, endpoint, id, edges }) => {
          const resource = byId.get(id)!
          return (
            <DetailSection key={key} value={key} title={
              <Text className={styles.relationEndpoint}>
                <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(resource), icons)} />
                <Text className="min-w-0">
                  <Text className={styles.rowName}><ResourceName name={resource.name} /></Text>
                  <Text className={styles.rowCaption}>
                    {endpoint === 'from' ? 'Source' : 'Target'} · {countLabel(edges.length, 'connection')}
                  </Text>
                </Text>
              </Text>
            }>
              {children(edges, endpoint)}
            </DetailSection>
          )
        })}
      </Accordion>
      {singles.length > 0 && children(singles)}
    </Box>
  )
}
