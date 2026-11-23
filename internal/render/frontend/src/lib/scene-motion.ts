import type { Layout, Point, Position, ProjectedEdge, Route, Scene } from './graph.types.ts'
import { edgeCaption } from './graph-projection.ts'
import { CARD, GROUP_HEADER_HEIGHT } from './layout.config.ts'
import { edgeCaptionHeight, edgeCaptionPadding } from './elk.config.ts'
import { placeEdgeLabel, routeEdges } from './positioned-routing.mjs'

export const edgeKey = (edge: ProjectedEdge) => JSON.stringify([edge.from, edge.kind, edge.to, edge.state])
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const path = (points: Point[]) =>
  points.map((p, i) => !i ? `M${p.x} ${p.y}` : p.x === points[i - 1].x ? `V${p.y}` : `H${p.x}`).join(' ')

export const layoutBounds = (positions: Layout['positions']): Layout => {
  if (!positions.size) return { positions, width: 0, height: 0 }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const box of positions.values()) {
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  return { positions, left, top, width: right - left, height: bottom - top }
}

export const translateScene = (scene: Scene, delta: Point): Scene => {
  if (!delta.x && !delta.y) return scene
  const positions = new Map([...scene.layout.positions].map(([id, box]) =>
    [id, { ...box, x: box.x + delta.x, y: box.y + delta.y }],
  ))
  return {
    ...scene,
    layout: layoutBounds(positions),
    routes: scene.routes.map((route) => {
      if (!route) return null
      const points = route.points.map(({ x, y }) => ({ x: x + delta.x, y: y + delta.y }))
      const label = route.label && { ...route.label, style: {
        left: route.label.style.left + delta.x, top: route.label.style.top + delta.y,
      } }
      return { points, d: path(points), label }
    }),
  }
}

export const canPlace = (scene: Scene, id: string, point: Point, positions = scene.layout.positions) => {
  const item = scene.current.items.get(id)
  const parent = item?.parent && positions.get(item.parent.id)
  if (!parent || item.expanded) return false
  if (
    point.x < parent.x || point.y < parent.y + GROUP_HEADER_HEIGHT ||
    point.x + CARD.width > parent.x + parent.width || point.y + CARD.height > parent.y + parent.height
  ) return false
  for (const sibling of item.parent!.children) {
    if (sibling.id === id) continue
    const box = positions.get(sibling.id)
    if (box && point.x < box.x + box.width && point.x + CARD.width > box.x &&
        point.y < box.y + box.height && point.y + CARD.height > box.y) return false
  }
  return true
}

export const placementKey = (id: string, parent: string) => JSON.stringify([id, parent])

export const positionScene = (scene: Scene, saved: ReadonlyMap<string, Point>, measure: (text: string) => number): Scene => {
  if (!saved.size) return scene
  const positions = new Map(scene.layout.positions)
  let moved = false
  for (const id of positions.keys()) {
    const item = scene.current.items.get(id)!
    if (!item.parent || item.expanded) continue
    const offset = saved.get(placementKey(id, item.parent.id))
    if (!offset) continue
    const parent = positions.get(item.parent.id)!
    const point = { x: parent.x + offset.x, y: parent.y + offset.y }
    const box = positions.get(id)!
    if ((point.x === box.x && point.y === box.y) || !canPlace(scene, id, point, positions)) continue
    positions.set(id, { ...box, ...point })
    moved = true
  }
  if (!moved) return scene
  const layout = layoutBounds(positions)
  const routes = routeEdges(scene.current, layout)
  if (routes.some((route, index) => !route && scene.routes[index])) return scene
  const obstacles = [...positions].map(([id, box]) =>
    scene.current.items.get(id)?.expanded ? { ...box, height: GROUP_HEADER_HEIGHT } : box,
  )
  for (const [index, route] of routes.entries()) {
    if (!route) continue
    const text = edgeCaption(scene.current.edges[index])
    if (!text) continue
    const width = measure(text) + 2 * edgeCaptionPadding
    const box = placeEdgeLabel(route.points, width, edgeCaptionHeight + 2 * edgeCaptionPadding, obstacles)
    if (!box) continue
    obstacles.push(box)
    route.label = { text, style: { left: box.x + edgeCaptionPadding, top: box.y + edgeCaptionPadding } }
  }
  return { ...scene, layout, routes }
}

// Keep the existing route's bends. Only its leads need extra elbows when a port moves.
const attach = (points: Point[], port: Point, box: Position, origin: Position) => {
  const first = points[0], next = points[1]
  const horizontal = first.y === next.y
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02
  const farSide = horizontal ? near(first.x, origin.x + origin.width) : near(first.y, origin.y + origin.height)
  const adjusted = horizontal
    ? { x: box.x + (farSide ? box.width : 0), y: port.y }
    : { x: port.x, y: box.y + (farSide ? box.height : 0) }
  const lead = horizontal
    ? { x: adjusted.x + (farSide ? 16 : -16), y: adjusted.y }
    : { x: adjusted.x, y: adjusted.y + (farSide ? 16 : -16) }
  const elbow = horizontal ? { x: lead.x, y: next.y } : { x: next.x, y: lead.y }
  return [adjusted, lead, elbow, ...points.slice(1)]
}

export const followRoute = (
  route: Route, oldFrom: Position, oldTo: Position, from: Position, to: Position,
): Route => {
  const start = route.points[0], end = route.points.at(-1)!
  const dx = from.x - oldFrom.x, dy = from.y - oldFrom.y
  const tx = to.x - oldTo.x, ty = to.y - oldTo.y
  if (!dx && !dy && !tx && !ty && from.width === oldFrom.width && to.width === oldTo.width &&
    from.height === oldFrom.height && to.height === oldTo.height) return route

  let points: Point[]
  if (dx === tx && dy === ty && from.width === oldFrom.width && to.width === oldTo.width &&
    from.height === oldFrom.height && to.height === oldTo.height) {
    points = route.points.map(({ x, y }) => ({ x: x + dx, y: y + dy }))
  } else {
    // Split a straight path in two to let each port keep its own lead.
    const bends = route.points.length === 2
      ? [start, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, end]
      : route.points
    const resizedFrom = { ...from, height: Math.min(from.height, oldFrom.height) }
    const resizedTo = { ...to, height: Math.min(to.height, oldTo.height) }
    points = attach(bends, { x: start.x + dx, y: start.y + dy }, resizedFrom, oldFrom)
    points = attach(points.reverse(), { x: end.x + tx, y: end.y + ty }, resizedTo, oldTo).reverse()
  }
  const label = route.label && { ...route.label, style: {
    left: route.label.style.left + (dx + tx) / 2, top: route.label.style.top + (dy + ty) / 2,
  } }
  return { points, d: path(points), label }
}

const interpolateRoute = (previous: Route, next: Route, t: number): Route | undefined => {
  if (previous.points.length !== next.points.length) return
  for (const [i, point] of previous.points.slice(1).entries()) {
    const start = previous.points[i], nextStart = next.points[i], nextEnd = next.points[i + 1]
    if (Math.sign(point.x - start.x) !== Math.sign(nextEnd.x - nextStart.x) ||
        Math.sign(point.y - start.y) !== Math.sign(nextEnd.y - nextStart.y)) return
  }
  const points = next.points.map((point, i) => ({
    x: mix(previous.points[i].x, point.x, t), y: mix(previous.points[i].y, point.y, t),
  }))
  const label = next.label && previous.label ? { ...next.label, style: {
    left: mix(previous.label.style.left, next.label.style.left, t),
    top: mix(previous.label.style.top, next.label.style.top, t),
  } } : next.label
  return { points, d: path(points), label }
}

export const moveCard = (scene: Scene, id: string, point: Point): Scene => {
  const old = scene.layout.positions.get(id)
  if (!old) return scene
  const positions = new Map(scene.layout.positions)
  positions.set(id, { ...old, ...point })
  return { ...scene, dragging: id, layout: layoutBounds(positions), routes: scene.routes.map((route, index) => {
    const { from, to } = scene.current.edges[index]
    if (!route || (from !== id && to !== id)) return route
    return followRoute(route, scene.layout.positions.get(from)!, scene.layout.positions.get(to)!, positions.get(from)!, positions.get(to)!)
  }) }
}

export const motionFrame = (start: Scene, target: Scene, t: number): Scene => {
  if (t >= 1) return target
  const items = new Map(target.current.items)
  const fading = new Map<string, number>()
  const positions = new Map<string, Position>()
  // Insert parents first, including the cards that are leaving a closing group.
  const ids = new Set([...target.layout.positions.keys(), ...start.layout.positions.keys()])
  for (const id of ids) {
    const before = start.layout.positions.get(id), after = target.layout.positions.get(id)
    const item = (after ? target : start).current.items.get(id)!
    const parent = item.parent?.id
    const origin = before ?? (parent ? start.layout.positions.get(parent) : undefined) ?? after!
    const end = after ?? (parent ? target.layout.positions.get(parent) : undefined) ?? origin
    const sizeBefore = before ?? after!, sizeAfter = after ?? before!
    const position = {
      x: mix(origin.x, end.x, t), y: mix(origin.y, end.y, t),
      width: mix(sizeBefore.width, sizeAfter.width, t), height: mix(sizeBefore.height, sizeAfter.height, t),
      depth: item.parent ? sizeAfter.depth : 0,
    }
    positions.set(id, position)
    const opacity = start.motion?.fading.get(id) ?? (before ? 1 : 0)
    if (!before || !after) items.set(id, item)
    if (opacity < 1 || !after) fading.set(id, mix(opacity, after ? 1 : 0, t))
    if (before && after && start.current.items.get(id)?.expanded && !item.expanded) {
      items.set(id, { ...item, expanded: true })
    }
  }

  const oldEdges = new Map(start.current.edges.map((edge, index) => [edgeKey(edge), index]))
  const edges = [...target.current.edges]
  const edgeOpacity = new Map<number, number>()
  const routes = target.routes.map((next, index) => {
    if (!next) return next
    const edge = edges[index]
    const oldIndex = oldEdges.get(edgeKey(edge))
    const previous = oldIndex === undefined ? null : start.routes[oldIndex]
    oldEdges.delete(edgeKey(edge))
    if (previous) {
      const interpolated = interpolateRoute(previous, next, t)
      if (interpolated) {
        const opacity = start.motion?.edgeOpacity.get(oldIndex!) ?? 1
        if (opacity < 1) edgeOpacity.set(index, mix(opacity, 1, t))
        return interpolated
      }
    }
    const source = previous && t < 0.5 ? start : target
    const route = source === start ? previous! : next
    if (!previous) edgeOpacity.set(index, t)
    else if (previous.d !== next.d) edgeOpacity.set(index, 0.5 + Math.abs(t - 0.5))
    return followRoute(route, source.layout.positions.get(edge.from)!, source.layout.positions.get(edge.to)!,
      positions.get(edge.from)!, positions.get(edge.to)!)
  })
  for (const oldIndex of oldEdges.values()) {
    const route = start.routes[oldIndex]
    if (!route) continue
    const edge = start.current.edges[oldIndex]
    edgeOpacity.set(edges.length, (start.motion?.edgeOpacity.get(oldIndex) ?? 1) * (1 - t))
    edges.push(edge)
    routes.push(followRoute(route, start.layout.positions.get(edge.from)!, start.layout.positions.get(edge.to)!,
      positions.get(edge.from)!, positions.get(edge.to)!))
  }

  return {
    ...target, dragging: undefined, current: { ...target.current, items, edges },
    layout: layoutBounds(positions), routes,
    motion: { fading, edgeOpacity, activeItems: new Set(target.current.items.keys()), activeEdges: target.current.edges.length },
  }
}
