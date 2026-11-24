import type { Change, HierarchyItem, ProjectedItem, Resource, ResourcesById, Service, ServiceIcons } from './graph.types'

export const relationNames = {
  triggers: 'Events / invocations',
  connects_to: 'Configuration references',
  depends_on: 'Deployment dependencies',
  contains: 'Component hierarchy',
}

export const changeLabels = {
  create: '+ create',
  update: '~ update',
  delete: '− delete',
  replace: '↻ replace',
  unchanged: 'unchanged',
}

export const topologyNames = { before: 'Before changes', after: 'After changes' }

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
