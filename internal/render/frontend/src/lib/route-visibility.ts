import type { Route } from './graph.types.ts'
import { edgeCaptionFontSize, edgeCaptionHeight } from './elk.config.ts'

export const routeLayers = { paint: 1, label: 2 }

export const routeVisibility = (route: Route, transform: readonly [number, number, number], width: number, height: number) => {
  if (!width || !height) return routeLayers.paint | routeLayers.label
  const [x, y, zoom] = transform
  const padding = 24
  const left = (-x - padding) / zoom
  const right = (width - x + padding) / zoom
  const top = (-y - padding) / zoom
  const bottom = (height - y + padding) / zoom
  const intersects = (x1: number, y1: number, x2: number, y2: number) =>
    Math.max(x1, x2) >= left && Math.min(x1, x2) <= right &&
    Math.max(y1, y2) >= top && Math.min(y1, y2) <= bottom
  const { points, label } = route
  let visible = 0
  for (let i = 1; i < points.length; i++) {
    if (intersects(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y)) {
      visible = routeLayers.paint
      break
    }
  }
  if (label && intersects(
    label.style.left,
    label.style.top,
    label.style.left + label.text.length * edgeCaptionFontSize,
    label.style.top + edgeCaptionHeight,
  )) visible |= routeLayers.label
  return visible
}
