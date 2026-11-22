import { useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { floatingWindowConfig as config } from './floating-window.config'

type Point = { x: number; y: number }
type Sample = Point & { time: number }
type Drag = {
  pointer: number
  grab: Point
  start: Point
  samples: Sample[]
  moved: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const bounds = (element: HTMLElement) => ({
  left: config.margin,
  top: config.margin,
  right: Math.max(config.margin, document.documentElement.clientWidth - element.offsetWidth - config.margin),
  bottom: Math.max(
    config.margin,
    document.documentElement.clientHeight - element.offsetHeight - config.margin,
  ),
})

const keepOnScreen = (point: Point, element: HTMLElement): Point => {
  const { left, top, right, bottom } = bounds(element)
  return { x: clamp(point.x, left, right), y: clamp(point.y, top, bottom) }
}

const rubberBand = (value: number, min: number, max: number) => {
  const limit = clamp(value, min, max)
  const excess = value - limit
  return limit + (excess * config.rubberRange) / (config.rubberRange + Math.abs(excess))
}

const springPosition = (start: number, target: number, velocity: number, seconds: number) => {
  const offset = start - target
  return (
    target +
    (offset + (velocity + config.springRate * offset) * seconds) * Math.exp(-config.springRate * seconds)
  )
}

const sample = (event: PointerEvent<HTMLElement>): Sample => ({
  x: event.clientX,
  y: event.clientY,
  time: event.timeStamp,
})

export const useFloatingWindow = (open: boolean) => {
  const windowRef = useRef<HTMLDivElement>(null)
  const position = useRef<Point | null>(null)
  const drag = useRef<Drag | null>(null)
  const frame = useRef<number | null>(null)

  const stopSpring = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }

  const place = (element: HTMLElement, point: Point) => {
    if (!position.current) {
      // Work in viewport coordinates after the window leaves its CSS anchor.
      Object.assign(element.style, { left: '0px', top: '0px', right: 'auto', bottom: 'auto' })
    }
    element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
    position.current = point
  }

  const reset = (element: HTMLElement) => {
    stopSpring()
    position.current = null
    for (const property of ['left', 'top', 'right', 'bottom', 'transform']) {
      element.style.removeProperty(property)
    }
  }

  useEffect(() => {
    const element = windowRef.current
    if (!open || !element) return
    const recheck = () => {
      if (position.current && !drag.current && frame.current === null) {
        place(element, keepOnScreen(position.current, element))
      }
    }
    const observer = new ResizeObserver(recheck)
    observer.observe(element)
    window.addEventListener('resize', recheck)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recheck)
      stopSpring()
      drag.current = null
      position.current = null
    }
  }, [open])

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    if (!element || !event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return
    if (event.target.closest('button:not([data-window-grip])')) return

    stopSpring()
    const start = position.current ?? { x: element.offsetLeft, y: element.offsetTop }
    const grabbedAt = sample(event)
    drag.current = {
      pointer: event.pointerId,
      grab: { x: grabbedAt.x - start.x, y: grabbedAt.y - start.y },
      start,
      samples: [grabbedAt],
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    const active = drag.current
    if (!element || !active || active.pointer !== event.pointerId) return

    const next = sample(event)
    const x = next.x - active.grab.x
    const y = next.y - active.grab.y
    if (!active.moved && Math.hypot(x - active.start.x, y - active.start.y) < config.dragThreshold) return

    active.moved = true
    active.samples = [...active.samples, next].filter(
      (entry) => next.time - entry.time <= config.sampleWindowMs,
    )
    const { left, top, right, bottom } = bounds(element)
    place(element, { x: rubberBand(x, left, right), y: rubberBand(y, top, bottom) })
  }

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const start = position.current
    if (!element || !start || !active.moved) return

    const release = sample(event)
    const first = active.samples.find((entry) => release.time - entry.time <= config.sampleWindowMs)
    const seconds = first ? (release.time - first.time) / 1000 : 0
    const velocity =
      event.type === 'pointerup' && first && seconds > 0
        ? { x: (release.x - first.x) / seconds, y: (release.y - first.y) / seconds }
        : { x: 0, y: 0 }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      place(element, keepOnScreen(start, element))
      return
    }

    const throwDistance = (speed: number) =>
      clamp(speed * config.projectionSeconds, -config.maxThrow, config.maxThrow)
    const target = keepOnScreen(
      { x: start.x + throwDistance(velocity.x), y: start.y + throwDistance(velocity.y) },
      element,
    )
    const startedAt = performance.now()
    const settle = (now: number) => {
      const time = Math.max(0, (now - startedAt) / 1000)
      const limit = config.maxThrow / config.projectionSeconds
      const point = {
        x: springPosition(start.x, target.x, clamp(velocity.x, -limit, limit), time),
        y: springPosition(start.y, target.y, clamp(velocity.y, -limit, limit), time),
      }
      if (
        time > config.maximumSettleSeconds ||
        (time > config.minimumSettleSeconds &&
          Math.hypot(point.x - target.x, point.y - target.y) < config.settleThreshold)
      ) {
        frame.current = null
        place(element, keepOnScreen(target, element))
      } else {
        place(element, point)
        frame.current = requestAnimationFrame(settle)
      }
    }
    frame.current = requestAnimationFrame(settle)
  }

  const moveWithKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    const element = windowRef.current
    if (!element) return
    if (event.key === 'Home') {
      event.preventDefault()
      reset(element)
      return
    }

    const direction = config.keyboardStep
    const x = event.key === 'ArrowLeft' ? -direction : event.key === 'ArrowRight' ? direction : 0
    const y = event.key === 'ArrowUp' ? -direction : event.key === 'ArrowDown' ? direction : 0
    if (!x && !y) return
    event.preventDefault()
    stopSpring()
    const start = position.current ?? { x: element.offsetLeft, y: element.offsetTop }
    place(element, keepOnScreen({ x: start.x + x, y: start.y + y }, element))
  }

  return {
    windowRef,
    moveWithKeys,
    dragEvents: {
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
    },
  }
}
