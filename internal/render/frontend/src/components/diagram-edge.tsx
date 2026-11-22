import { Text } from '../ui/text'
import type { EdgeProps } from '@xyflow/react'
import type { DiagramRelation } from './diagram.types'

import { FlowPath } from '../ui/flow-path'

export const DiagramEdge = ({ id, data, style, markerEnd, interactionWidth }: EdgeProps<DiagramRelation>) =>
  data ? (
    <FlowPath
      id={id}
      path={data.path}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
      style={style}
      className={data.wireClassName}
      underlay={data.underlay}
      stream={data.stream}
      overlay={
        data.label && (
          <Text className={data.labelClassName} data-edge-label={data.index} style={data.label.style}>
            {data.label.text}
          </Text>
        )
      }
    />
  ) : null
