import { Text } from '../ui/text'
import type { EdgeProps } from '@xyflow/react'
import type { DiagramRelation } from './diagram.types'

import { useViewportStore } from '@xyflow/react'
import { FlowPath } from '../ui/flow-path'
import { routeLayers, routeVisibility } from '../lib/route-visibility'

export const DiagramEdge = ({ id, data, style, markerEnd, interactionWidth }: EdgeProps<DiagramRelation>) => {
  const visible = useViewportStore(({ transform, width, height }) =>
    data ? routeVisibility(data.route, transform, width, height) : 0,
  )
  if (!data) return null
  const { route } = data
  return (
    <g opacity={data.opacity} pointerEvents={data.retiring ? 'none' : undefined}>
      <FlowPath
        id={id}
        path={route.d}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={style}
        className={data.wireClassName}
        underlay={visible & routeLayers.paint ? data.underlay : undefined}
        stream={visible & routeLayers.paint ? data.stream : undefined}
        overlay={
          Boolean(visible & routeLayers.label) && route.label && (
            <Text className={data.labelClassName} data-edge-label={data.index} style={{ ...route.label.style, opacity: data.opacity }}>
              {route.label.text}
            </Text>
          )
        }
      />
    </g>
  )
}
