export const relationNames = {
  triggers: 'Events / invocations',
  connects_to: 'Configuration references',
  depends_on: 'Pulumi dependencies',
  contains: 'Component hierarchy',
}

export const changeLabels = {
  create: '+ create',
  update: '~ update',
  delete: '− delete',
  replace: '↻ replace',
  unchanged: 'unchanged',
}

export const countLabel = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export function changeSummary(item, byId) {
  if (!item.group) return changeLabels[item.node.change] || 'unchanged'
  const counts = new Map()
  for (const id of item.members) {
    const change = byId.get(id)?.change
    if (change && change !== 'unchanged') counts.set(change, (counts.get(change) || 0) + 1)
  }
  return [...counts].map(([change, count]) => `${changeLabels[change]} ${count}`).join(' · ') || 'unchanged'
}

export function groupRelations(edges) {
  return Object.entries(relationNames).flatMap(([kind, name]) => {
    const relations = edges.filter(edge => edge.kind === kind)
    return relations.length ? [{ kind, name, relations }] : []
  })
}

export function diagramElement(svg, field, value) {
  return [...svg.querySelectorAll(`[data-${field}]`)].find(element => element.dataset[field] === String(value))
}
