import type { BaseEdgeProps } from '@xyflow/react'
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import type { CSSProperties, ReactNode } from 'react'

export type FlowPaintLayer = { className: string; style: CSSProperties }

export function FlowPath({
  overlay,
  underlay,
  stream,
  ...props
}: BaseEdgeProps & {
  overlay?: ReactNode
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
}) {
  return (
    <>
      {underlay?.map((layer) => (
        <BaseEdge key={layer.className} path={props.path} interactionWidth={0} aria-hidden="true" {...layer} />
      ))}
      <BaseEdge {...props} />
      {stream && <BaseEdge path={props.path} interactionWidth={0} aria-hidden="true" {...stream} />}
      {overlay && <EdgeLabelRenderer>{overlay}</EdgeLabelRenderer>}
    </>
  )
}
