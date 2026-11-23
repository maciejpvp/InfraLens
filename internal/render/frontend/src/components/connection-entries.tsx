import type { GraphEdge } from '../lib/graph.types'
import type { useEdgeDetails } from '../hooks/use-edge-details'

import { Box } from '../ui/box'
import { Text } from '../ui/text'
import { Evidence } from './evidence'
import { Metadata } from './metadata'
import { inspectorStyles as styles } from './inspector.variants'

export const ConnectionEntries = ({ edges, toEntry }: {
  edges: GraphEdge[]
  toEntry: ReturnType<typeof useEdgeDetails>['toEntry']
}) => (
  <Box className={styles.connections}>
    {edges.map((edge) => {
      const { title, endpoints, topology, evidence } = toEntry(edge)
      return (
        <Box key={JSON.stringify([edge.from, edge.to, edge.state])} className={styles.connection}>
          {title && (
            <>
              <Text as="h3" className={styles.connectionTitle}>{title}</Text>
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
