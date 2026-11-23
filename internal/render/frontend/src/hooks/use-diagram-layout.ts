import type { RefObject } from 'react'
import type { GraphView, Hierarchy, Scene } from '../lib/graph.types'

import { useEffect, useMemo, useState } from 'react'
import { edgeCaptionFontSize } from '../lib/elk.config'
import { useSceneMotion } from './use-scene-motion'
import { layoutDiagram } from '../lib/elk-layout.ts'

export const useDiagramLayout = (tree: Hierarchy, current: GraphView, anchor: RefObject<string | null>) => {
  const [result, setResult] = useState<{ current: GraphView; scene?: Scene; failed?: boolean }>()
  const measureText = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return (text: string) => text.length * (edgeCaptionFontSize / 2)
    context.font = `${edgeCaptionFontSize}px ${getComputedStyle(document.documentElement).fontFamily}`
    return (text: string) => context.measureText(text).width
  }, [])

  useEffect(() => {
    let active = true
    layoutDiagram(current, measureText).then(
      (result) => {
        if (active) setResult({ current, scene: { tree, current, ...result } })
      },
      () => {
        if (active) setResult((previous) => ({ current, scene: previous?.scene, failed: true }))
      },
    )
    return () => {
      active = false
    }
  }, [tree, current, measureText])

  const { scene, moveCard } = useSceneMotion(result?.scene, anchor, measureText)
  const layoutPending = result?.current !== current
  return { scene, moveCard, layoutPending, layoutFailed: !layoutPending && Boolean(result?.failed) }
}
