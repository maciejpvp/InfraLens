import { useCallback, useRef } from 'react'
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

const visibleViewport = () => {
  const viewport = window.visualViewport
  const width = viewport?.width ?? document.documentElement.clientWidth
  const height = viewport?.height ?? document.documentElement.clientHeight
  const margin = Math.min(config.margin, width / 2, height / 2)
  return {
    left: (viewport?.offsetLeft ?? 0) + margin,
    top: (viewport?.offsetTop ?? 0) + margin,
    width: width - 2 * margin,
    height: height - 2 * margin,
  }
}

const keepOnScreen = (point: Point, { width, height }: DOMRect): Point => {
  const viewport = visibleViewport()
  return {
    x: clamp(point.x, viewport.left, viewport.left + Math.max(0, viewport.width - width)),
    y: clamp(point.y, viewport.top, viewport.top + Math.max(0, viewport.height - height)),
  }
}

const cssZoom = (element: HTMLElement) => element.currentCSSZoom || 1

const place = (element: HTMLElement, point?: Point) => {
  const rect = element.getBoundingClientRect()
  const next = keepOnScreen(point ?? rect, rect)
  if (!point && next.x === rect.x && next.y === rect.y) return
  if (!element.style.left) {
    Object.assign(element.style, { left: '0px', top: '0px', right: 'auto', bottom: 'auto' })
  }
  // Pointer coordinates and DOM rects are already scaled. CSS translations are scaled on paint.
  const zoom = cssZoom(element)
  element.style.transform = `translate3d(${next.x / zoom}px, ${next.y / zoom}px, 0)`
}

const fitToViewport = (element: HTMLElement) => {
  const viewport = visibleViewport()
  const zoom = cssZoom(element)
  element.style.setProperty('--inspector-max-width', `${viewport.width / zoom}px`)
  element.style.setProperty('--inspector-max-height', `${viewport.height / zoom}px`)
  place(element)
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
  const drag = useRef<Drag | null>(null)
  const frame = useRef<number | null>(null)

  const stopSpring = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])

  const reset = (element: HTMLElement) => {
    stopSpring()
    for (const property of ['left', 'top', 'right', 'bottom', 'transform']) {
      element.style.removeProperty(property)
    }
    fitToViewport(element)
  }

  const attachWindow = useCallback((element: HTMLDivElement | null) => {
    if (!open || !element) return
    windowRef.current = element
    const viewport = window.visualViewport
    const recheck = () => fitToViewport(element)
    recheck()
    const observer = new ResizeObserver(recheck)
    observer.observe(element)
    observer.observe(document.documentElement)
    window.addEventListener('resize', recheck)
    viewport?.addEventListener('resize', recheck)
    viewport?.addEventListener('scroll', recheck)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recheck)
      viewport?.removeEventListener('resize', recheck)
      viewport?.removeEventListener('scroll', recheck)
      stopSpring()
      drag.current = null
      windowRef.current = null
    }
  }, [open, stopSpring])

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    if (!element || !event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return
    if (event.target.closest('button:not([data-window-grip])')) return

    event.currentTarget.setPointerCapture(event.pointerId)
    stopSpring()
    const { x, y } = element.getBoundingClientRect()
    const start = { x, y }
    const grabbedAt = sample(event)
    drag.current = {
      pointer: event.pointerId,
      grab: { x: grabbedAt.x - start.x, y: grabbedAt.y - start.y },
      start,
      samples: [grabbedAt],
      moved: false,
    }
  }

  const trackDrag = (element: HTMLElement, active: Drag, next: Sample) => {
    const x = next.x - active.grab.x
    const y = next.y - active.grab.y
    if (!active.moved && Math.hypot(x - active.start.x, y - active.start.y) < config.dragThreshold) return

    active.moved = true
    active.samples = [...active.samples, next].filter(
      (entry) => next.time - entry.time <= config.sampleWindowMs,
    )
    place(element, { x, y })
  }

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    const active = drag.current
    if (!active || active.pointer !== event.pointerId) return
    const released = event.type === 'pointerup'
    const release = sample(event)
    if (released && element) trackDrag(element, active, release)

    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!element || !released || !active.moved || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const start = element.getBoundingClientRect()
    const first = active.samples[0]
    const seconds = first ? (release.time - first.time) / 1000 : 0
    const velocity =
      first && seconds > 0
        ? { x: (release.x - first.x) / seconds, y: (release.y - first.y) / seconds }
        : { x: 0, y: 0 }

    const throwDistance = (speed: number) =>
      clamp(speed * config.projectionSeconds, -config.maxThrow, config.maxThrow)
    const target = keepOnScreen(
      { x: start.x + throwDistance(velocity.x), y: start.y + throwDistance(velocity.y) },
      start,
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
        place(element, target)
      } else {
        place(element, point)
        frame.current = requestAnimationFrame(settle)
      }
    }
    frame.current = requestAnimationFrame(settle)
  }

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const element = windowRef.current
    const active = drag.current
    if (!element || !active || active.pointer !== event.pointerId) return
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
      endDrag(event)
      return
    }
    trackDrag(element, active, sample(event))
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
    const rect = element.getBoundingClientRect()
    place(element, { x: rect.x + x, y: rect.y + y })
  }

  return {
    windowRef: attachWindow,
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
