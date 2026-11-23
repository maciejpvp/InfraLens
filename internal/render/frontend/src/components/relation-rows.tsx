import type { ComponentProps } from 'react'
import type { GraphEdge } from '../lib/graph.types'

import { ArrowRight } from 'lucide-react'
import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { Text } from '../ui/text'
import { DetailRow } from './detail-row'
import { inspectorStyles as styles } from './inspector.variants'

export const RelationRows = ({ edges, toRow }: {
  edges: GraphEdge[]
  toRow: (edge: GraphEdge) => Omit<ComponentProps<typeof DetailRow>, 'title'> & {
    from: string
    to: string
  }
}) => (
  <Box className={styles.rows}>
    {edges.map((edge) => {
      const { from, to, ...row } = toRow(edge)
      return (
        <DetailRow key={JSON.stringify([edge.from, edge.to, edge.state])} {...row} title={
          <Text className={styles.rowRoute}>
            <Text>{from}</Text>
            <Icon icon={ArrowRight} className="size-4 text-muted-foreground" />
            <Text className="sr-only"> to </Text>
            <Text>{to}</Text>
          </Text>
        } />
      )
    })}
  </Box>
)
