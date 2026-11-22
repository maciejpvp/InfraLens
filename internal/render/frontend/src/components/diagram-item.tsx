import { Box } from '../ui/box'
import { Button } from '../ui/button'
import { Text } from '../ui/text'
import type { NodeProps } from '@xyflow/react'
import type { DiagramNode } from './diagram.types'

import { Position } from '@xyflow/react'
import { FlowAnchor } from '../ui/flow-anchor'
import { useDiagramItem } from '../hooks/use-diagram-item'
import { GroupToggle } from './group-toggle'
import { ServiceIcon } from './service-icon'
import { diagramStyles as styles } from './diagram.variants'

export const DiagramItem = ({ data }: NodeProps<DiagramNode>) => {
  const { item, bounds } = data
  const {
    buttonProps,
    groupClassName,
    cardTopClassName,
    count,
    showHeaderIcon,
    type,
    accent,
    meta,
    changeBadge,
    toggleProps,
    icon,
  } = useDiagramItem(data)

  return (
    <Box className={styles.item} style={bounds} data-diagram-card>
      {item.expanded && <Box className={groupClassName} />}
      <Button unstyled type="button" {...buttonProps}>
        {item.expanded ? (
          <>
            {showHeaderIcon && <ServiceIcon icon={icon} />}
            <Text className={styles.headerName}>{item.name}</Text>
            <Text className={styles.groupCount}>{count}</Text>
          </>
        ) : (
          <>
            <Text className={styles.accent} style={accent} />
            <Text className={cardTopClassName}>
              <ServiceIcon icon={icon} />
              <Text className={styles.nodeType}>{type}</Text>
              {changeBadge && <Text className={changeBadge.className}>{changeBadge.text}</Text>}
            </Text>
            <Text className={styles.nodeName}>{item.name}</Text>
            <Text className={styles.nodeMeta}>{meta}</Text>
          </>
        )}
      </Button>
      {toggleProps && <GroupToggle {...toggleProps} />}
      <FlowAnchor type="target" position={Position.Left} className={styles.handle} />
      <FlowAnchor type="source" position={Position.Right} className={styles.handle} />
    </Box>
  )
}
