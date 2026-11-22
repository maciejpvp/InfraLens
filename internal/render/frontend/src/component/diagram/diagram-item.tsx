import type { NodeProps } from '@xyflow/react'
import type { DiagramNode } from './diagram.types'

import { Handle, Position } from '@xyflow/react'
import { useDiagramItem } from '../../hooks/use-diagram-item'
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
    <div className={styles.item} style={bounds} data-diagram-card>
      {item.expanded && <div className={groupClassName} />}
      <button type="button" {...buttonProps}>
        {item.expanded ? (
          <>
            {showHeaderIcon && <ServiceIcon icon={icon} />}
            <span className={styles.headerName}>{item.name}</span>
            <span className={styles.groupCount}>{count}</span>
          </>
        ) : (
          <>
            <span className={styles.accent} style={accent} />
            <span className={cardTopClassName}>
              <ServiceIcon icon={icon} />
              <span className={styles.nodeType}>{type}</span>
              {changeBadge && <span className={changeBadge.className}>{changeBadge.text}</span>}
            </span>
            <span className={styles.nodeName}>{item.name}</span>
            <span className={styles.nodeMeta}>{meta}</span>
          </>
        )}
      </button>
      {toggleProps && <GroupToggle {...toggleProps} />}
      <Handle type="target" position={Position.Left} isConnectable={false} className={styles.handle} />
      <Handle type="source" position={Position.Right} isConnectable={false} className={styles.handle} />
    </div>
  )
}
