import type { Change, EdgeKind, GraphEdge, HierarchyItem, ProjectedItem, Resource, ResourcesById, Service, ServiceIcons } from './graph.types'

import { changeLabels, relationNames } from './graph-view.config'

export const countLabel = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const serviceIconSrc = (service: Service | null | undefined, icons: ServiceIcons) =>
  service?.icon && Object.hasOwn(icons, service.icon) ? icons[service.icon] : undefined

export const countChanges = (nodes: Iterable<Resource | undefined>) => {
  const counts = new Map<Change, number>()
  for (const node of nodes) {
    const change = node?.change
    if (change && change !== 'unchanged') counts.set(change, (counts.get(change) || 0) + 1)
  }
  return [...counts].map(([change, count]) => `${changeLabels[change]} ${count}`).join(' · ')
}

export const changeSummary = (item: HierarchyItem | ProjectedItem, byId: ResourcesById) =>
  item.group
    ? countChanges([...item.members].map((id) => byId.get(id))) || 'unchanged'
    : changeLabels[item.node.change ?? 'unchanged']

export const groupRelations = (edges: GraphEdge[]) => {
  return (Object.keys(relationNames) as EdgeKind[]).flatMap((kind) => {
    const name = relationNames[kind]
    const relations = edges.filter((edge) => edge.kind === kind)
    return relations.length ? [{ kind, name, relations }] : []
  })
}

export const diagramElement = (
  root: HTMLElement | null,
  field: 'item' | 'toggle' | 'edge-id',
  value: string,
) => {
  if (!root) return
  return [...root.querySelectorAll<HTMLElement | SVGGElement>(`[data-${field}]`)].find(
    (element) => element.getAttribute(`data-${field}`) === value,
  )
}

export const connectionTitle = ({ from, to }: GraphEdge, byId: ResourcesById) =>
  `${byId.get(from)!.name} → ${byId.get(to)!.name}`
