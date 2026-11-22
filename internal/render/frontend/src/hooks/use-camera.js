import { useLayoutEffect, useRef } from 'react'

export function useCamera(stage, svg, search, zoomLabel, scene) {
  const camera = useRef(null)
  const fitWidth = useRef(1)
  const pan = useRef(null)

  function apply(next) {
    camera.current = next
    svg.current.setAttribute('viewBox', `${next.x} ${next.y} ${next.w} ${next.h}`)
    zoomLabel.current.textContent = `${Math.round(fitWidth.current / next.w * 100)}%`
  }

  function fit() {
    const { clientWidth: width, clientHeight: height } = stage.current
    const top = search.current.getBoundingClientRect().bottom + 30
    const { layout } = scene
    const scale = Math.max((layout.width + 60) / Math.max(1, width - 40), (layout.height + 60) / Math.max(1, height - top - 85))
    const w = width * scale
    fitWidth.current = w
    apply({ x: (layout.width - w) / 2, y: (layout.height - (height - top - 85) * scale) / 2 - top * scale, w, h: height * scale })
  }

  function zoom(factor, cx = .5, cy = .5) {
    const { x, y, w, h } = camera.current
    const width = Math.min(fitWidth.current * 5, Math.max(fitWidth.current * .025, w * factor))
    const height = width * stage.current.clientHeight / stage.current.clientWidth
    apply({ x: x + (w - width) * cx, y: y + (h - height) * cy, w: width, h: height })
  }

  function center(position, expanded) {
    const w = Math.min(camera.current.w, Math.max(650, stage.current.clientWidth))
    const h = w * stage.current.clientHeight / stage.current.clientWidth
    apply({ x: position.x + position.width / 2 - w / 2, y: position.y + (expanded ? 24 : position.height / 2) - h / 2, w, h })
  }

  useLayoutEffect(() => {
    if (camera.current) return
    fit()
    const { current, layout, tree } = scene
    const { clientWidth: width, clientHeight: height } = stage.current
    if (width > 620 || !current.items.size) return
    const first = [...current.items.values()]
      .filter(item => !item.group && tree.flowIDs.has(item.node.id))
      .sort((a, b) => {
        const p = layout.positions.get(a.id), q = layout.positions.get(b.id)
        return p.x - q.x || p.y - q.y
      })[0] || current.items.get(current.roots[0])
    const p = layout.positions.get(first.id)
    const w = Math.min(camera.current.w, 520)
    apply({ x: p.x - 24, y: p.y - (search.current.getBoundingClientRect().bottom + 36) * w / width, w, h: w * height / width })
  }, [scene])

  useLayoutEffect(() => {
    const element = stage.current
    function wheel(event) {
      if (event.target.closest('.material')) return
      event.preventDefault()
      const box = element.getBoundingClientRect()
      zoom(event.deltaY > 0 ? 1.12 : .89, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
    }
    let width = element.clientWidth, height = element.clientHeight
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width && element.clientHeight === height) return
      width = element.clientWidth
      height = element.clientHeight
      apply({ ...camera.current, h: camera.current.w * height / width })
    })
    observer.observe(element)
    element.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', wheel)
    }
  }, [])

  function pointerDown(event) {
    if (event.button !== 0 || event.target.closest('[data-item],[data-edge],.material')) return
    pan.current = { x: event.clientX, y: event.clientY, camera: camera.current, moved: false, pointer: event.pointerId }
    stage.current.setPointerCapture(event.pointerId)
  }

  function pointerMove(event) {
    const drag = pan.current
    if (!drag || drag.pointer !== event.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (Math.hypot(dx, dy) > 4) drag.moved = true
    if (!drag.moved) return
    stage.current.classList.add('cursor-grabbing!')
    const { x, y, w, h } = drag.camera
    apply({ x: x - dx * w / stage.current.clientWidth, y: y - dy * h / stage.current.clientHeight, w, h })
  }

  function endPan(event) {
    if (pan.current?.pointer !== event.pointerId) return
    pan.current = null
    stage.current.classList.remove('cursor-grabbing!')
  }

  return { fit, zoom, center, stageEvents: {
    onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: endPan,
    onPointerCancel: endPan, onLostPointerCapture: endPan,
  } }
}
