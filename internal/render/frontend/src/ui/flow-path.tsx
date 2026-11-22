import type { BaseEdgeProps } from '@xyflow/react'
import type { ReactNode } from 'react'
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'

export const FlowPath = ({ overlay, ...props }: BaseEdgeProps & { overlay?: ReactNode }) => (
  <>
    <BaseEdge {...props} />
    {overlay && <EdgeLabelRenderer>{overlay}</EdgeLabelRenderer>}
  </>
)
