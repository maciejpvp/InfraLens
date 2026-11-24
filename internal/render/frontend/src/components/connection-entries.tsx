import type { GraphEdge, ResourcesById, ServiceIcons } from '../lib/graph.types'
import type { Endpoint } from '../lib/relation-groups'
import type { useEdgeDetails } from '../hooks/use-edge-details'

import { Box } from '../ui/box'
import { Text } from '../ui/text'
import { Evidence } from './evidence'
import { Metadata } from './metadata'
import { RelationEndpoints } from './relation-endpoints'
import { inspectorStyles as styles } from './inspector.variants'

export const ConnectionEntries = ({ edges, byId, icons, shared, toEntry }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  shared?: Endpoint
  toEntry: ReturnType<typeof useEdgeDetails>['toEntry']
}) => (
  <Box className={styles.connections}>
    {edges.map((edge) => {
      const { endpoints, topology, evidence } = toEntry(edge)
      return (
        <Box key={JSON.stringify([edge.from, edge.to, edge.state])} className={styles.connection}>
          {endpoints.length > 0 && (
            <>
              <Text as="h3" className={styles.connectionTitle}>
                <RelationEndpoints edge={edge} byId={byId} icons={icons} shared={shared} />
              </Text>
              <Metadata rows={endpoints} />
            </>
          )}
          {topology && <Text as="p" className={styles.note}>{topology}</Text>}
          <Evidence groups={evidence} />
        </Box>
      )
    })}
  </Box>
)
