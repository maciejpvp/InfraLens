import type { RefObject } from 'react'
import type { Point, Scene } from '../lib/graph.types'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isDenseScene } from '../lib/route-visibility'
import { canPlace, motionFrame, moveCard, placementKey, positionScene, translateScene } from '../lib/scene-motion.ts'

export const useSceneMotion = (
  target: Scene | undefined,
  anchor: RefObject<string | null>,
  measure: (text: string) => number,
  fixed = false,
) => {
  const [scene, setScene] = useState<Scene>()
  const shown = useRef<Scene | undefined>(undefined)
  const settled = useRef<Scene | undefined>(undefined)
  const saved = useRef(new Map<string, Point>())
  const frame = useRef(0)
  const timeout = useRef(0)
  const drag = useRef<{ id: string; start: Scene; destination: Scene; point: Point } | undefined>(undefined)
  const publish = useCallback((next: Scene) => {
    shown.current = next
    setScene(next)
  }, [])
  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current)
    clearTimeout(timeout.current)
  }, [])

  const animate = useCallback((start: Scene, next: Scene, duration: number, layoutTransition = false) => {
    stop()
    settled.current = next
    if ((layoutTransition && (isDenseScene(start) || isDenseScene(next))) ||
        matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      publish(next)
      return
    }

    const began = performance.now()
    const finish = () => {
      stop()
      publish(next)
    }
    const tick = (now: number) => {
      const t = Math.max(0, Math.min((now - began) / duration, 1))
      if (t === 1) {
        finish()
        return
      }
      // Fast response with a soft landing, without overshoot.
      publish(motionFrame(start, next, 1 - (1 - t) ** 3))
      frame.current = requestAnimationFrame(tick)
    }
    publish(motionFrame(start, next, 0))
    frame.current = requestAnimationFrame(tick)
    // A throttled or background tab may stop receiving animation frames.
    timeout.current = window.setTimeout(finish, duration + 40)
  }, [publish, stop])

  useLayoutEffect(() => {
    if (!target) return
    const current = shown.current
    const previousTarget = settled.current
    drag.current = undefined
    let next = positionScene(target, saved.current, measure)
    const id = anchor.current
    const from = id ? current?.layout.positions.get(id) : undefined
    const to = id ? next.layout.positions.get(id) : undefined
    if (fixed && id && current?.tree === target.tree) {
      animate(current, next, 150, true)
    } else if (!fixed && from && to && current?.tree === target.tree) {
      next = translateScene(next, { x: from.x - to.x, y: from.y - to.y })
      const distance = Math.max(Math.abs(from.height - to.height), Math.abs(from.width - to.width))
      animate(current, next, Math.max(150, Math.min(270, distance * 2)), true)
    } else {
      stop()
      if (!fixed && previousTarget?.tree === target.tree && current) {
        // Connection filters must not erase the visual origin established by a toggle.
        const common = next.current.roots.find((root) => previousTarget.layout.positions.has(root))
        const oldRoot = common && previousTarget.layout.positions.get(common)
        const newRoot = common && next.layout.positions.get(common)
        if (oldRoot && newRoot) next = translateScene(next, { x: oldRoot.x - newRoot.x, y: oldRoot.y - newRoot.y })
      }
      settled.current = next
      publish(next)
    }
    return stop
  }, [target, fixed, anchor, measure, animate, publish, stop])

  const begin = useCallback((id: string) => {
    const current = shown.current
    const box = current?.layout.positions.get(id)
    const destination = settled.current
    const finalBox = destination?.layout.positions.get(id)
    if (!current || !box || !destination || !finalBox || drag.current || !canPlace(destination, id, finalBox)) return
    stop()
    drag.current = { id, start: current, destination, point: box }
    return box
  }, [stop])

  const move = useCallback((id: string, point: Point) => {
    const moving = drag.current
    if (!moving || moving.id !== id) return
    moving.point = point
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => publish(moveCard(moving.start, id, moving.point)))
  }, [publish])

  const end = useCallback((id: string, accept: boolean) => {
    const moving = drag.current
    if (!moving || moving.id !== id) return
    stop()
    drag.current = undefined
    const { start, destination, point } = moving
    const live = shown.current ?? start
    if (accept && canPlace(destination, id, point)) {
      const parentId = destination.current.items.get(id)!.parent!.id
      const parent = destination.layout.positions.get(parentId)!
      const key = placementKey(id, parentId)
      const placement = new Map([[key, { x: point.x - parent.x, y: point.y - parent.y }]])
      const next = positionScene(destination, placement, measure)
      if (next !== destination) {
        saved.current.set(key, placement.get(key)!)
        if (start.motion) animate(live, next, 170)
        else {
          settled.current = next
          publish(next)
        }
        return
      }
    }
    if (live === destination) publish(destination)
    else animate(live, destination, 170)
  }, [animate, measure, publish, stop])

  const actions = useMemo(() => ({ begin, move, end }), [begin, move, end])
  return { scene, settled, moveCard: actions }
}

export type MoveCard = ReturnType<typeof useSceneMotion>['moveCard']
