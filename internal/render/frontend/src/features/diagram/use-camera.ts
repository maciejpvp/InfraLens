import { cubicBezier } from 'motion/react'
import type { OnMove, ReactFlowInstance } from '@xyflow/react'
import type { RefObject } from 'react'
import type { Position, Scene } from './layout/layout-model'
import type { DiagramNode, DiagramRelation } from './diagram-elements'

import { useCallback, useRef } from 'react'
import { motionPresets, navigationDuration } from '../../lib/motion'
export const cameraConfig = {
  mobileMaxWidth: 620,
  mobileInitialWidth: 520,
  minimumCenterWidth: 650,
  minZoom: 0.001,
  maxZoom: 40,
  initialTopPadding: 44,
  bottomPadding: 24,
  mobileTopPadding: 52,
  mobileLeftPadding: 24,
}

const viewportEase = cubicBezier(...motionPresets.workspace.ease)
const viewportMotion = () => ({ duration: navigationDuration(), ease: viewportEase, interpolate: 'linear' as const })

export const useCamera = (
  stage: RefObject<HTMLElement | null>,
  zoomLabel: RefObject<HTMLOutputElement | null>,
  scene: Scene | undefined,
  workflowFocused: boolean,
) => {
  const flow = useRef<ReactFlowInstance<DiagramNode, DiagramRelation> | null>(null)
  const fitZoom = useRef(1)

  const showZoom = useCallback<OnMove>((_, { zoom }) => {
    if (!zoomLabel.current) return
    const label = `${Math.round((zoom / fitZoom.current) * 100)}%`
    if (zoomLabel.current.textContent !== label) zoomLabel.current.textContent = label
  }, [zoomLabel])

  const fitViewport = useCallback((layout = scene?.layout) => {
    if (!stage.current || !layout) return
    const { clientWidth: width, clientHeight: height } = stage.current
    if (!width || !height) return
    const top = Math.min(cameraConfig.initialTopPadding, height / 5)
    const usableHeight = height - top - Math.min(cameraConfig.bottomPadding, height / 5)
    const zoom = Math.min(
      width / (layout.width + 64),
      usableHeight / (layout.height + 32),
    )
    return {
      x: (width - layout.width * zoom) / 2 - (layout.left ?? 0) * zoom,
      y: top + (usableHeight - layout.height * zoom) / 2 - (layout.top ?? 0) * zoom,
      zoom,
    }
  }, [scene?.layout, stage])

  const fit = () => {
    const viewport = fitViewport()
    if (!viewport) return
    fitZoom.current = viewport.zoom
    flow.current?.setViewport(viewport, viewportMotion())
  }

  const frame = useCallback((instance: ReactFlowInstance<DiagramNode, DiagramRelation>, animate = false) => {
    flow.current = instance
    const initial = fitViewport()
    if (!initial || !scene || !stage.current) return
    fitZoom.current = initial.zoom
    const { current, layout, tree } = scene
    const width = stage.current.clientWidth
    if (width > cameraConfig.mobileMaxWidth || !current.items.size) {
      instance.setViewport(initial, animate ? viewportMotion() : undefined)
      if (!animate) showZoom(null, initial)
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
      y: cameraConfig.mobileTopPadding - first.y * zoom,
      zoom,
    }
    instance.setViewport(viewport, animate ? viewportMotion() : undefined)
    if (!animate) showZoom(null, viewport)
  }, [fitViewport, scene, stage, showZoom, workflowFocused])

  const init = useCallback((instance: ReactFlowInstance<DiagramNode, DiagramRelation>) => frame(instance), [frame])

  const frameWorkflow = () => {
    if (flow.current) frame(flow.current, true)
  }

  const zoom = (factor: number) => {
    if (!flow.current) return
    const zoom = flow.current.getZoom() / factor
    flow.current.zoomTo(Math.min(cameraConfig.maxZoom, Math.max(cameraConfig.minZoom, zoom)), viewportMotion())
  }

  const center = (position: Position, expanded: boolean) => {
    if (!flow.current || !stage.current) return
    const width = stage.current.clientWidth
    const zoom = Math.max(flow.current.getZoom(), width / Math.max(cameraConfig.minimumCenterWidth, width))
    flow.current.setCenter(
      position.x + position.width / 2,
      position.y + (expanded ? 24 : position.height / 2),
      { zoom, ...viewportMotion() },
    )
  }

  return { fit, frameWorkflow, zoom, center, init, showZoom, flow }
}
