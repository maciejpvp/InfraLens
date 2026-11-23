import { Text } from '../ui/text'
import type { EdgeProps } from '@xyflow/react'
import type { DiagramRelation } from './diagram.types'

import { FlowPath } from '../ui/flow-path'

export const DiagramEdge = ({ id, data, style, markerEnd, interactionWidth }: EdgeProps<DiagramRelation>) =>
  data ? (
    <g opacity={data.opacity} pointerEvents={data.retiring ? 'none' : undefined}>
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
            <Text className={data.labelClassName} data-edge-label={data.index} style={{ ...data.label.style, opacity: data.opacity }}>
              {data.label.text}
            </Text>
          )
        }
      />
    </g>
  ) : null
