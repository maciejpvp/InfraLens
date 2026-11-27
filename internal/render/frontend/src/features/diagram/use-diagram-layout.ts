import type { RefObject } from 'react'
import type { GraphView, Hierarchy } from '../../lib/graph.types'
import type { Scene } from './layout/layout-model'

import { useEffect, useMemo, useRef, useState } from 'react'
import { edgeCaptionFontSize } from './layout/dimensions'
import { layoutDiagram } from './layout/elk-layout.ts'
import { revealInPlace } from './layout/scene-motion.ts'
import { useSceneMotion } from './use-scene-motion'

export const useDiagramLayout = (tree: Hierarchy, current: GraphView, context: GraphView, liftedId: string | undefined, anchor: RefObject<string | null>, workflow: boolean) => {
  const [result, setResult] = useState<{ current: GraphView; scene?: Scene; fixed?: boolean; workflow?: boolean; failed?: boolean }>()
  const contextScene = useRef<Scene>(undefined)
  const measureText = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return (text: string) => text.length * (edgeCaptionFontSize / 2)
    context.font = `${edgeCaptionFontSize}px ${getComputedStyle(document.documentElement).fontFamily}`
    return (text: string) => context.measureText(text).width
  }, [])
  const { scene, moveCard, settled } = useSceneMotion(result?.scene, anchor, measureText, result?.fixed, result?.workflow)

  useEffect(() => {
    let active = true
    if (settled.current?.current === context) contextScene.current = settled.current
    const base = contextScene.current?.current === context ? contextScene.current : undefined
    const resolve = async () => {
      if (current === context && base) return { scene: base, fixed: true }
      if (liftedId) {
        const reference = base ?? { tree, current: context, ...await layoutDiagram(context, measureText) }
        if (active) contextScene.current = reference
        const lifted = revealInPlace(reference, current, liftedId, measureText)
        if (lifted) return { scene: lifted, fixed: true }
      }
      return { scene: { tree, current, ...await layoutDiagram(current, measureText, workflow ? 'DOWN' : 'RIGHT') } }
    }
    resolve().then(
      (resolved) => {
        if (active) setResult({ current, workflow, ...resolved })
      },
      () => {
        if (active) setResult((previous) => ({ current, scene: previous?.scene, failed: true }))
      },
    )
    return () => {
      active = false
    }
  }, [tree, current, context, liftedId, measureText, settled, workflow])

  const layoutPending = result?.current !== current
  return { scene, moveCard, layoutPending, layoutFailed: !layoutPending && Boolean(result?.failed) }
}
