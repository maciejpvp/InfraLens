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

const changesByStatus = (nodes: Iterable<Resource | undefined>) => {
  const counts = new Map<Change, number>()
  for (const node of nodes) {
    const change = node?.change ?? 'unchanged'
    counts.set(change, (counts.get(change) || 0) + 1)
  }
  return counts
}

const formatChanges = (counts: ReadonlyMap<Change, number>, compact = false) =>
  [...counts].filter(([change]) => change !== 'unchanged').map(([change, count]) => {
    const label = changeLabels[change]
    return `${compact ? label.split(' ', 1)[0] : label} ${count}`
  }).join(' · ')

export const countChanges = (nodes: Iterable<Resource | undefined>) => formatChanges(changesByStatus(nodes))

export const groupChanges = (members: ReadonlySet<string>, byId: ResourcesById) => {
  const counts = changesByStatus([...members].map((id) => byId.get(id)))
  const change = counts.size === 1 ? counts.keys().next().value : undefined
  const summary = formatChanges(counts) || changeLabels.unchanged
  return { change, summary, compactSummary: counts.size > 1 ? formatChanges(counts, true) : summary }
}

export const changeSummary = (item: HierarchyItem | ProjectedItem, byId: ResourcesById) =>
  item.group
    ? countChanges([...item.members].map((id) => byId.get(id))) || 'unchanged'
    : changeLabels[item.node.change ?? 'unchanged']
