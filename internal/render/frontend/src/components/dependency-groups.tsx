import type { ReactNode } from 'react'
import type { GraphEdge, ResourcesById, ServiceIcons } from '../lib/graph.types'

import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { groupDependenciesByService } from '../lib/graph-projection.ts'
import { serviceIconSrc } from '../lib/graph-view'
import { Accordion } from '../ui/accordion'
import { Text } from '../ui/text'
import { Icon } from '../ui/icon'
import { DetailSection } from './detail-section'
import { ServiceIcon } from './service-icon'
import { inspectorStyles as styles } from './inspector.variants'

export const DependencyGroups = ({ edges, byId, icons, children }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  children: (edges: GraphEdge[]) => ReactNode
}) => {
  const groups = useMemo(() => groupDependenciesByService(edges, byId), [edges, byId])
  return (
    <Accordion type="multiple" className={styles.sections}>
      {groups.map(({ key, from, to, edges }) => (
        <DetailSection key={key} value={key} title={
          <Text className={styles.dependencyTitle}>
            <ServiceIcon icon={serviceIconSrc(from, icons)} />{from.name}
            <Icon icon={ArrowRight} className="size-4 text-muted-foreground" />
            <Text className="sr-only"> to </Text>
            <ServiceIcon icon={serviceIconSrc(to, icons)} />{to.name} ({edges.length})
          </Text>
        }>
          {children(edges)}
        </DetailSection>
      ))}
    </Accordion>
  )
}
