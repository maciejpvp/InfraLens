import type { MouseEvent } from 'react'
import type { GraphEdge, HierarchyItem, ResourcesById } from '../lib/graph.types'
import type { MetadataRow, OpenRelation, OpenResource } from '../lib/inspector.types'

import { changeSummary, connectionTitle, countLabel, groupRelations } from '../lib/graph-view'
import { flowDescriptions } from '../lib/graph-projection.ts'

type ResourceDetailsOptions = {
  item: HierarchyItem
  links: GraphEdge[]
  byId: ResourcesById
  onResource: OpenResource
  onEdges: OpenRelation
}

export const useResourceDetails = ({ item, links, byId, onResource, onEdges }: ResourceDetailsOptions) => {
  const groups = groupRelations(links)
  const rows: MetadataRow[] = [
    ['Type', item.node?.type || item.service?.name || 'Resource group'],
    ['Stack', item.stack],
    ['Changes', changeSummary(item, byId)],
    [
      'Connections',
      groups.map(({ name, relations }) => `${name}: ${relations.length}`).join(' · ') || 'No connections',
    ],
  ]
  const resourceGroup = item.group
    ? {
        title: `Resources in group (${item.members.size})`,
        entries: [...item.members].sort().map((id) => ({
          id,
          title: byId.get(id)!.name,
          onClick: (event: MouseEvent<HTMLButtonElement>) => onResource(id, event.currentTarget),
        })),
      }
    : null

  const relations = groups.map(({ kind, name, relations }) => ({
    kind,
    title: `${name} (${relations.length})`,
    entries: relations.map((edge) => {
      const descriptions = flowDescriptions([edge])
        .map(({ label }) => label)
        .join(' · ')
      const within = item.group && item.members.has(edge.from) && item.members.has(edge.to)
      const evidence = countLabel(edge.evidence.length, 'evidence item')
      return {
        id: JSON.stringify([edge.from, edge.to, edge.state]),
        title: connectionTitle(edge, byId),
        descriptions,
        summary: evidence + (within ? ' · within group' : ''),
        onClick: (event: MouseEvent<HTMLButtonElement>) => onEdges([edge], event.currentTarget),
      }
    }),
  }))

  return { rows, resourceGroup, relations }
}
