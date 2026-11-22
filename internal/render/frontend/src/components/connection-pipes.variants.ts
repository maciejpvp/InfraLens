import type { CSSProperties } from 'react'
import type { ProjectedEdge } from '../lib/graph.types'
import type { FlowPaintLayer } from '../ui/flow-path'
import { pipeAppearance, tubeProfile } from './connection-pipes.config'

type FlowStyle = CSSProperties & { '--pipe-period': string; '--pipe-duration': string }

type PipePaint = {
  wire: CSSProperties
  underlay?: readonly FlowPaintLayer[]
  stream?: FlowPaintLayer
}

const round = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const makeLayer = (name: string, style: CSSProperties): FlowPaintLayer => ({
  className: `${name} pointer-events-none`,
  style,
})

// Each layer uses the original centerline. The offset rim lights one side without changing the route.
const paintPipe = ({
  color,
  width,
  dash,
  tube,
  current,
}: (typeof pipeAppearance)[ProjectedEdge['kind']]): PipePaint => {
  const { shadow, wall, channel, rim } = tubeProfile
  const wire: CSSProperties = {
    ...round,
    strokeLinecap: dash ? 'butt' : 'round',
    color,
    stroke: color,
    strokeWidth: width,
    strokeDasharray: dash,
    strokeOpacity: tube ? tubeProfile.coreOpacity : undefined,
  }
  const underlay = tube && [
    makeLayer('pipe-shadow', {
      ...round,
      stroke: shadow.color,
      strokeWidth: width + shadow.extraWidth,
      strokeOpacity: shadow.opacity,
      transform: shadow.offset,
    }),
    makeLayer('pipe-wall', {
      ...round,
      stroke: tube.wall,
      strokeWidth: width + wall.extraWidth,
      strokeOpacity: wall.opacity,
    }),
    makeLayer('pipe-channel', {
      ...round,
      stroke: tube.channel,
      strokeWidth: width + channel.extraWidth,
    }),
    makeLayer('pipe-rim', {
      ...round,
      stroke: tube.rim,
      strokeWidth: rim.width,
      strokeOpacity: rim.opacity,
      strokeDasharray: tube.rimDash,
      transform: rim.offset,
    }),
  ]
  const streamStyle: FlowStyle | undefined = current && {
    ...round,
    strokeOpacity: tubeProfile.currentOpacity,
    stroke: current.color,
    strokeWidth: current.width,
    strokeDasharray: current.dash,
    '--pipe-period': current.period,
    '--pipe-duration': current.duration,
  }
  const stream = streamStyle && makeLayer('pipe-current motion-safe:animate-pipe-current', streamStyle)
  return { wire, underlay, stream }
}

export const pipePaint = {
  triggers: paintPipe(pipeAppearance.triggers),
  connects_to: paintPipe(pipeAppearance.connects_to),
  depends_on: paintPipe(pipeAppearance.depends_on),
} satisfies Record<ProjectedEdge['kind'], PipePaint>
