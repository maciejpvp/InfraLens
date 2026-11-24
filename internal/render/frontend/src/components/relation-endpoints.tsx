import { ArrowDown } from 'lucide-react'
import type { GraphEdge, ResourcesById, ServiceIcons } from '../lib/graph.types'
import { serviceFor } from '../lib/graph-projection'
import { inspectorServiceIconSrc } from '../lib/graph-view'
import type { Endpoint } from '../lib/relation-groups'
import { Icon } from '../ui/icon'
import { Text } from '../ui/text'
import { ResourceName } from './resource-name'
import { ServiceIcon } from './service-icon'
import { inspectorStyles as styles } from './inspector.variants'

export const RelationEndpoints = ({ edge, byId, icons, shared }: {
  edge: GraphEdge
  byId: ResourcesById
  icons: ServiceIcons
  shared?: Endpoint
}) => {
  const endpoint = (side: Endpoint) => {
    const resource = byId.get(edge[side])!
    return (
      <Text className={styles.relationEndpoint}>
        <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(resource), icons)} />
        <Text className={styles.rowName}><ResourceName name={resource.name} /></Text>
      </Text>
    )
  }

  if (shared) return endpoint(shared === 'from' ? 'to' : 'from')

  return (
    <>
      {endpoint('from')}
      <Icon icon={ArrowDown} className="my-0.5 ml-0.5 block size-3 text-muted-foreground" />
      <Text className="sr-only"> to </Text>
      {endpoint('to')}
    </>
  )
}
