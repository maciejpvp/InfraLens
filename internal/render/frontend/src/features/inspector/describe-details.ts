import type { MouseEvent } from 'react'
import type { MetadataRow } from '../../components/detail-sections'
import { flowDescriptions, serviceFor } from '../../lib/graph-projection.ts'
import { changeLabels, changeSummary, countLabel, relationNames, serviceIconSrc, topologyNames } from '../../lib/graph-view'
import type { EdgeKind, Evidence, GraphEdge, HierarchyItem, ResourcesById, Service, ServiceIcons } from '../../lib/graph.types'
import type { OpenRelation, OpenResource } from './use-inspector'

export type EvidenceGroup = {
  key: string
  label?: string
  details?: string
  entries: { source: string; resource?: string; property: string }[]
}

const relationNotes = {
  triggers: 'Configured event or invocation route.',
  connects_to:
    'Source configuration references the target. The reference does not specify read or write direction.',
  depends_on: 'The source depends on the target during deployment. A dependency does not imply data flow.',
  contains: 'Parent and child relationship in the infrastructure hierarchy.',
}

export const inspectorServiceIconSrc = (service: Service, icons: ServiceIcons) =>
  service.id === 'aws:appsync' && Object.hasOwn(icons, 'appsync') ? icons.appsync : serviceIconSrc(service, icons)

export const groupRelations = (edges: GraphEdge[]) => {
  return (Object.keys(relationNames) as EdgeKind[]).flatMap((kind) => {
    const name = relationNames[kind]
    const relations = edges.filter((edge) => edge.kind === kind)
    return relations.length ? [{ kind, name, relations }] : []
  })
}

const endpointRows = ({ from, to }: GraphEdge, byId: ResourcesById, icons: ServiceIcons): MetadataRow[] =>
  [
    ['Source', from],
    ['Target', to],
  ].map(([label, id]) => {
    const resource = byId.get(id)!
    const { stack, type, change } = resource
    return [label, `${stack || 'No stack'} · ${type} · ${changeLabels[change ?? 'unchanged']}`, inspectorServiceIconSrc(serviceFor(resource), icons)]
  })

const groupEvidence = (evidence: Evidence[], byId: ResourcesById) => {
  const groups = new Map<string, EvidenceGroup>()
  for (const proof of evidence) {
    const key = JSON.stringify([proof.label || '', proof.details || ''])
    if (!groups.has(key)) groups.set(key, { key, label: proof.label, details: proof.details, entries: [] })
    groups.get(key)!.entries.push({
      source: proof.source,
      resource: proof.resource && (byId.get(proof.resource)?.name || proof.resource),
      property: proof.property || proof.source,
    })
  }
  return [...groups.values()]
}

export type EdgeDetailsProps = {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
}

export const describeEdges = ({ edges, byId, icons }: EdgeDetailsProps) => {
  const groups = groupRelations(edges)
  const states = [...new Set(edges.map((edge) => edge.state).filter((state) => state !== undefined))]
    .sort()
    .reverse()
  const evidenceCount = edges.reduce((sum, edge) => sum + edge.evidence.length, 0)
  const rows: MetadataRow[] = [
    ['Type', groups.map((group) => group.name).join(' · ')],
    ['Evidence', `${countLabel(edges.length, 'connection')} · ${countLabel(evidenceCount, 'evidence item')}`],
  ]
  if (edges.length === 1) rows.push(...endpointRows(edges[0], byId, icons))
  if (states.length) rows.push(['Topology', states.map((state) => topologyNames[state]).join(' · ')])

  const sections = groups.map(({ kind, name, relations }) => ({
    kind,
    title: `${name} · ${countLabel(relations.length, 'connection')}`,
    note: relationNotes[kind],
    edges: relations,
  }))
  const toEntry = (edge: GraphEdge) => ({
    endpoints: edges.length > 1 ? endpointRows(edge, byId, icons) : [],
    topology: states.length > 1 && edge.state && topologyNames[edge.state],
    evidence: groupEvidence(edge.evidence, byId),
  })
  return { rows, sections, toEntry, defaultSections: groups.length === 1 ? [groups[0].kind] : [] }
}

export type ResourceDetailsOptions = {
  item: HierarchyItem
  links: GraphEdge[]
  byId: ResourcesById
  onResource: OpenResource
  onEdges: OpenRelation
}

export const describeResource = ({ item, links, byId, onResource, onEdges }: ResourceDetailsOptions) => {
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
          resource: byId.get(id)!,
          onClick: (event: MouseEvent<HTMLButtonElement>) => onResource(id, event.currentTarget),
        })),
      }
    : null

  const relations = groups.map(({ kind, name, relations }) => ({
    kind,
    title: `${name} (${relations.length})`,
    edges: relations,
  }))

  const toRow = (edge: GraphEdge) => ({
    descriptions: flowDescriptions([edge]).map(({ label }) => label).join(' · '),
    summary: countLabel(edge.evidence.length, 'evidence item') +
      (item.group && item.members.has(edge.from) && item.members.has(edge.to) ? ' · within group' : ''),
    onClick: (event: MouseEvent<HTMLButtonElement>) => onEdges(edge, event.currentTarget),
  })

  return { rows, resourceGroup, relations, toRow }
}
