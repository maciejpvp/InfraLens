import type { RefObject } from 'react'
import type { OnMove, ReactFlowInstance } from '@xyflow/react'
import type { DiagramNode, DiagramRelation } from '../components/diagram.types'
import type { Position, Scene } from '../lib/graph.types'

import { useRef } from 'react'
import { cameraConfig } from './camera.config'

export const useCamera = (
  stage: RefObject<HTMLElement | null>,
  search: RefObject<HTMLInputElement | null>,
  zoomLabel: RefObject<HTMLOutputElement | null>,
  scene: Scene | undefined,
  legend: RefObject<HTMLElement | null>,
) => {
  const flow = useRef<ReactFlowInstance<DiagramNode, DiagramRelation> | null>(null)
  const fitZoom = useRef(1)

  const showZoom: OnMove = (_, { zoom }) => {
    if (!zoomLabel.current) return
    zoomLabel.current.textContent = `${Math.round((zoom / fitZoom.current) * 100)}%`
  }

  const fitViewport = () => {
    if (!stage.current || !search.current || !scene) return
    const { clientWidth: width, clientHeight: height } = stage.current
    const { layout } = scene
    const top = search.current.getBoundingClientRect().bottom + cameraConfig.initialTopPadding
    const legendTop = legend.current?.getBoundingClientRect().top ?? height
    const bottom = Math.max(cameraConfig.bottomPadding, height - legendTop + cameraConfig.legendGap)
    const usableHeight = height - top - bottom
    const zoom = Math.min(
      Math.max(1, width - 40) / (layout.width + 60),
      Math.max(1, usableHeight) / (layout.height + 60),
    )
    return {
      x: (width - layout.width * zoom) / 2,
      y: top + (usableHeight - layout.height * zoom) / 2,
      zoom,
    }
  }

  const fit = () => {
    const viewport = fitViewport()
    if (!viewport) return
    fitZoom.current = viewport.zoom
    flow.current?.setViewport(viewport)
    showZoom(null, viewport)
  }

  const init = (instance: ReactFlowInstance<DiagramNode, DiagramRelation>) => {
    flow.current = instance
    const initial = fitViewport()
    if (!initial || !scene || !stage.current || !search.current) return
    fitZoom.current = initial.zoom
    const { current, layout, tree } = scene
    const width = stage.current.clientWidth
    if (width > cameraConfig.mobileMaxWidth || !current.items.size) {
      instance.setViewport(initial)
      showZoom(null, initial)
      return
    }

    const entries = [...layout.positions]
    const first =
      entries
        .filter(([id]) => !current.items.get(id)!.group && tree.flowIDs.has(id))
        .sort(([, a], [, b]) => a.x - b.x || a.y - b.y)[0]?.[1] ?? layout.positions.get(current.roots[0])
    if (!first) return
    const zoom = Math.max(initial.zoom, width / cameraConfig.mobileInitialWidth)
    const viewport = {
      x: (cameraConfig.mobileLeftPadding - first.x) * zoom,
      y: search.current.getBoundingClientRect().bottom + cameraConfig.mobileTopPadding - first.y * zoom,
      zoom,
    }
    instance.setViewport(viewport)
    showZoom(null, viewport)
  }

  const zoom = (factor: number) => {
    if (!flow.current) return
    const zoom = flow.current.getZoom() / factor
    flow.current.zoomTo(Math.min(cameraConfig.maxZoom, Math.max(cameraConfig.minZoom, zoom)))
  }

  const center = (position: Position, expanded: boolean) => {
    if (!flow.current || !stage.current) return
    const width = stage.current.clientWidth
    const zoom = Math.max(flow.current.getZoom(), width / Math.max(cameraConfig.minimumCenterWidth, width))
    flow.current.setCenter(
      position.x + position.width / 2,
      position.y + (expanded ? 24 : position.height / 2),
      { zoom },
    )
  }

  return { fit, zoom, center, init, showZoom, flow }
}
