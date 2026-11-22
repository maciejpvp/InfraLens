import type { Change, EdgeKind, GraphEdge, HierarchyItem, ProjectedItem, ResourcesById } from './graph.types'

import { changeLabels, relationNames } from './graph-view.config'

export const countLabel = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const changeSummary = (item: HierarchyItem | ProjectedItem, byId: ResourcesById) => {
  if (!item.group) return changeLabels[item.node.change ?? 'unchanged']
  const counts = new Map<Change, number>()
  for (const id of item.members) {
    const change = byId.get(id)?.change
    if (change && change !== 'unchanged') counts.set(change, (counts.get(change) || 0) + 1)
  }
  return [...counts].map(([change, count]) => `${changeLabels[change]} ${count}`).join(' · ') || 'unchanged'
}

export const groupRelations = (edges: GraphEdge[]) => {
  return (Object.keys(relationNames) as EdgeKind[]).flatMap((kind) => {
    const name = relationNames[kind]
    const relations = edges.filter((edge) => edge.kind === kind)
    return relations.length ? [{ kind, name, relations }] : []
  })
}

export const diagramElement = (
  root: HTMLElement | null,
  field: 'item' | 'toggle' | 'edge',
  value: string,
) => {
  if (!root) return
  return [...root.querySelectorAll<HTMLElement | SVGGElement>(`[data-${field}]`)].find(
    (element) => element.dataset[field] === String(value),
  )
}

export const connectionTitle = ({ from, to }: GraphEdge, byId: ResourcesById) =>
  `${byId.get(from)!.name} → ${byId.get(to)!.name}`
