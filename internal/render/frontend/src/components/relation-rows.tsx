import type { GraphEdge, ResourcesById, ServiceIcons } from '../lib/graph.types'
import type { Endpoint } from '../lib/relation-groups'
import type { useResourceDetails } from '../hooks/use-resource-details'

import { Box } from '../ui/box'
import { Text } from '../ui/text'
import { DetailRow } from './detail-row'
import { RelationEndpoints } from './relation-endpoints'
import { inspectorStyles as styles } from './inspector.variants'

export const RelationRows = ({ edges, byId, icons, shared, toRow }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  shared?: Endpoint
  toRow: ReturnType<typeof useResourceDetails>['toRow']
}) => (
  <Box className={styles.rows}>
    {edges.map((edge) => {
      const { descriptions, summary, onClick } = toRow(edge)
      return (
        <DetailRow key={JSON.stringify([edge.from, edge.to, edge.state])} onClick={onClick}>
          <RelationEndpoints edge={edge} byId={byId} icons={icons} shared={shared} />
          <Text className={styles.relationCaption}>
            {descriptions && `${descriptions} · `}{summary}
          </Text>
        </DetailRow>
      )
    })}
  </Box>
)
