import type { EdgeProps } from '@xyflow/react'
import type { DiagramRelation } from './diagram.types'

import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'

export const DiagramEdge = ({ id, data, style, markerEnd, interactionWidth }: EdgeProps<DiagramRelation>) =>
  data ? (
    <>
      <BaseEdge
        id={id}
        path={data.path}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={style}
        className={data.wireClassName}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <span className={data.labelClassName} data-edge-label={data.index} style={data.label.style}>
            {data.label.text}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  ) : null
