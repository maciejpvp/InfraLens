import { useLayoutEffect, useRef } from 'react'

export function ResizeHandle({ panelId, axis, label }: {
  panelId: string
  axis: 'width' | 'height'
  label: string
}) {
  const handle = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; start: number; size: number } | null>(null)
  const horizontal = axis === 'width'

  const measure = (panel: HTMLElement) => {
    const style = getComputedStyle(panel)
    return {
      min: Math.round(parseFloat(horizontal ? style.minWidth : style.minHeight)),
      max: Math.round(parseFloat(horizontal ? style.maxWidth : style.maxHeight)),
      current: horizontal ? panel.offsetWidth : panel.offsetHeight,
    }
  }

  useLayoutEffect(() => {
    const element = handle.current
    const panel = element?.parentElement
    if (!element || !panel) return
    const read = () => {
      const { min, max, current } = measure(panel)
      if (!Number.isFinite(max)) return
      element.setAttribute('aria-valuemin', String(min))
      element.setAttribute('aria-valuemax', String(max))
      element.setAttribute('aria-valuenow', String(current))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [axis])

  const resize = (panel: HTMLElement, size: number) => {
    const { min, max } = measure(panel)
    panel.closest<HTMLElement>(horizontal ? '.report-diagram-row' : '.report-workspace')?.style.setProperty(
      horizontal ? '--inspector-width' : '--cost-height',
      Math.max(min, Math.min(max, size)) + 'px',
    )
  }

  return (
    <div ref={handle} className="resize-handle" role="separator" tabIndex={0} title={label}
      aria-label={label} aria-orientation={horizontal ? 'vertical' : 'horizontal'} aria-controls={panelId}
      onPointerDown={(event) => {
        const panel = event.currentTarget.parentElement
        if (!panel || !event.isPrimary || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointer: event.pointerId,
          start: horizontal ? event.clientX : event.clientY,
          size: measure(panel).current,
        }
      }}
      onPointerMove={(event) => {
        const panel = event.currentTarget.parentElement
        const active = drag.current
        if (!panel || active?.pointer !== event.pointerId) return
        const position = horizontal ? event.clientX : event.clientY
        resize(panel, active.size + (active.start - position) / (panel.currentCSSZoom || 1))
      }}
      onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={(event) => {
        const panel = event.currentTarget.parentElement
        if (!panel) return
        const { min, max, current } = measure(panel)
        const increase = horizontal ? 'ArrowLeft' : 'ArrowUp'
        const decrease = horizontal ? 'ArrowRight' : 'ArrowDown'
        const step = event.shiftKey ? 64 : 16
        let size: number
        if (event.key === increase) size = current + step
        else if (event.key === decrease) size = current - step
        else if (event.key === 'Home') size = min
        else if (event.key === 'End') size = max
        else return
        event.preventDefault()
        resize(panel, size)
      }}
    />
  )
}
