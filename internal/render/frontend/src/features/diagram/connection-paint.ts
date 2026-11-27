import type { CSSProperties } from 'react'
import type { ProjectedEdge } from '../../lib/graph.types'
import type { FlowPaintLayer } from './flow-path'

type PipeAppearance = {
  label: string
  color: string
  width: number
  dash?: string
  tube?: {
    wall: string
    channel: string
    rim: string
    rimDash?: string
  }
  current?: { color: string; width: number; dash: string; period: string; duration: string }
}

const tubeProfile = {
  shadow: { extraWidth: 4.2, color: 'var(--pipe-shadow)', offset: 'translateY(0.65px)', opacity: 0.72 },
  wall: { extraWidth: 3.4, opacity: 0.94 },
  channel: { extraWidth: 1.9 },
  rim: { width: 0.65, offset: 'translate(-1.25px, -1.25px)', opacity: 0.56 },
  coreOpacity: 0.68,
  currentOpacity: 0.91,
}

export const pipeKinds = ['triggers', 'connects_to', 'depends_on'] as const

export const pipeAppearance: Record<ProjectedEdge['kind'], PipeAppearance> = {
  triggers: {
    label: 'Event / invocation',
    color: 'var(--pipe-event)',
    width: 2.45,
    tube: { wall: 'var(--pipe-event-wall)', channel: 'var(--pipe-event-channel)', rim: 'var(--pipe-event-rim)' },
    current: { color: 'var(--pipe-event-current)', width: 1.35, dash: '6 34', period: '-40', duration: '2.6s' },
  },
  connects_to: {
    label: 'Configuration reference',
    color: 'var(--pipe-reference)',
    width: 2.05,
    tube: { wall: 'var(--pipe-reference-wall)', channel: 'var(--pipe-reference-channel)', rim: 'var(--pipe-reference-rim)', rimDash: '12 10' },
    current: { color: 'var(--pipe-reference-current)', width: 1.18, dash: '4 22', period: '-26', duration: '3.3s' },
  },
  depends_on: {
    label: 'Deployment dependency',
    color: 'var(--pipe-dependency)',
    width: 1.45,
    dash: '7 4 2 4',
  },
}

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
