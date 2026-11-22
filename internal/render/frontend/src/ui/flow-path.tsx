import type { BaseEdgeProps } from '@xyflow/react'
import type { ReactNode, CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'

export type FlowPaintLayer = { className: string; style: CSSProperties }

export const FlowPath = ({
  overlay,
  underlay,
  stream,
  ...props
}: BaseEdgeProps & {
  overlay?: ReactNode
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
}) => (
  <>
    {underlay?.map((layer) => (
      <BaseEdge key={layer.className} path={props.path} interactionWidth={0} aria-hidden="true" {...layer} />
    ))}
    <BaseEdge {...props} />
    {stream && <BaseEdge path={props.path} interactionWidth={0} aria-hidden="true" {...stream} />}
    {overlay && <EdgeLabelRenderer>{overlay}</EdgeLabelRenderer>}
  </>
)
