import type { CSSProperties } from 'react'
import type { FlowPaintLayer } from './flow-path'
import { FlowPath } from './flow-path'

export const FlowSwatch = ({
  wire,
  underlay,
  stream,
  className,
}: {
  wire: CSSProperties
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
  className?: string
}) => (
  <svg className={className} viewBox="0 0 48 14" aria-hidden="true">
    <FlowPath path="M4 7H40" style={wire} interactionWidth={0} underlay={underlay} stream={stream} />
    <path d="M39 3.5L45 7L39 10.5Z" fill={wire.stroke} />
  </svg>
)
