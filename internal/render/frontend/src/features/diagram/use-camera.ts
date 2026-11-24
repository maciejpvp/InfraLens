import type { OnMove, ReactFlowInstance } from '@xyflow/react'
import type { RefObject } from 'react'
import type { Position, Scene } from './layout/layout-model'
import type { DiagramNode, DiagramRelation } from './diagram-elements'

import { useCallback, useRef } from 'react'
export const cameraConfig = {
  mobileMaxWidth: 620,
  mobileInitialWidth: 520,
  minimumCenterWidth: 650,
  minZoom: 0.001,
  maxZoom: 40,
  initialTopPadding: 30,
  bottomPadding: 85,
  legendGap: 12,
  mobileTopPadding: 36,
  mobileLeftPadding: 24,
}

export const useCamera = (
  stage: RefObject<HTMLElement | null>,
  search: RefObject<HTMLInputElement | null>,
  zoomLabel: RefObject<HTMLOutputElement | null>,
  scene: Scene | undefined,
  legend: RefObject<HTMLElement | null>,
  workflowFocused: boolean,
  getObstruction?: () => DOMRect | undefined,
) => {
  const flow = useRef<ReactFlowInstance<DiagramNode, DiagramRelation> | null>(null)
  const fitZoom = useRef(1)

  const showZoom = useCallback<OnMove>((_, { zoom }) => {
    if (!zoomLabel.current) return
    const label = `${Math.round((zoom / fitZoom.current) * 100)}%`
    if (zoomLabel.current.textContent !== label) zoomLabel.current.textContent = label
  }, [zoomLabel])

  const fitViewport = useCallback((layout = scene?.layout) => {
    if (!stage.current || !search.current || !layout) return
    const { clientWidth: width, clientHeight: height } = stage.current
    const top = search.current.getBoundingClientRect().bottom + cameraConfig.initialTopPadding
    const legendTop = legend.current?.getBoundingClientRect().top ?? height
    const bottom = Math.max(cameraConfig.bottomPadding, height - legendTop + cameraConfig.legendGap)
    const usableHeight = height - top - bottom
    const obstruction = getObstruction?.()
    const stageLeft = stage.current.getBoundingClientRect().left
    const panelRight = obstruction ? obstruction.right - stageLeft : 0
    const left = panelRight > 0 && width - panelRight >= 300 ? panelRight + 12 : 0
    const usableWidth = width - left
    const zoom = Math.min(
      Math.max(1, usableWidth - 40) / (layout.width + 60),
      Math.max(1, usableHeight) / (layout.height + 60),
    )
    return {
      x: left + (usableWidth - layout.width * zoom) / 2 - (layout.left ?? 0) * zoom,
      y: top + (usableHeight - layout.height * zoom) / 2 - (layout.top ?? 0) * zoom,
      zoom,
    }
  }, [scene?.layout, stage, search, legend, getObstruction])

  const fit = () => {
    const viewport = fitViewport()
    if (!viewport) return
    fitZoom.current = viewport.zoom
    flow.current?.setViewport(viewport)
    showZoom(null, viewport)
  }

  const init = useCallback((instance: ReactFlowInstance<DiagramNode, DiagramRelation>) => {
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
        .sort(([, a], [, b]) => workflowFocused ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y)[0]?.[1] ?? layout.positions.get(current.roots[0])
    if (!first) return
    const zoom = Math.max(initial.zoom, width / cameraConfig.mobileInitialWidth)
    const viewport = {
      x: workflowFocused ? (width - first.width * zoom) / 2 - first.x * zoom
        : (cameraConfig.mobileLeftPadding - first.x) * zoom,
      y: search.current.getBoundingClientRect().bottom + cameraConfig.mobileTopPadding - first.y * zoom,
      zoom,
    }
    instance.setViewport(viewport)
    showZoom(null, viewport)
  }, [fitViewport, scene, stage, search, showZoom, workflowFocused])

  const frameWorkflow = () => {
    if (flow.current) init(flow.current)
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

  return { fit, frameWorkflow, zoom, center, init, showZoom, flow }
}
