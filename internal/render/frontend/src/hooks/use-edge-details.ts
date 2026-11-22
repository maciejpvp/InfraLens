import type { Evidence, GraphEdge, ResourcesById } from '../lib/graph.types'
import type { EvidenceGroup, MetadataRow } from '../lib/inspector.types'

import { relationNotes } from '../components/inspector.config'
import { connectionTitle, countLabel, groupRelations } from '../lib/graph-view'
import { changeLabels, topologyNames } from '../lib/graph-view.config'

const endpointRows = ({ from, to }: GraphEdge, byId: ResourcesById): MetadataRow[] =>
  [
    ['Source', from],
    ['Target', to],
  ].map(([label, id]) => {
    const { stack, type, change } = byId.get(id)!
    return [label, `${stack || 'No stack'} · ${type} · ${changeLabels[change ?? 'unchanged']}`]
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

export const useEdgeDetails = ({ edges, byId }: { edges: GraphEdge[]; byId: ResourcesById }) => {
  const groups = groupRelations(edges)
  const states = [...new Set(edges.map((edge) => edge.state).filter((state) => state !== undefined))]
    .sort()
    .reverse()
  const evidenceCount = edges.reduce((sum, edge) => sum + edge.evidence.length, 0)
  const rows: MetadataRow[] = [
    ['Type', groups.map((group) => group.name).join(' · ')],
    ['Evidence', `${countLabel(edges.length, 'connection')} · ${countLabel(evidenceCount, 'evidence item')}`],
  ]
  if (edges.length === 1) rows.push(...endpointRows(edges[0], byId))
  if (states.length) rows.push(['Topology', states.map((state) => topologyNames[state]).join(' · ')])

  const sections = groups.map(({ kind, name, relations }) => ({
    kind,
    title: `${name} · ${countLabel(relations.length, 'connection')}`,
    note: relationNotes[kind],
    entries: relations.map((edge) => ({
      key: JSON.stringify([edge.from, edge.to, edge.state]),
      title: edges.length > 1 ? connectionTitle(edge, byId) : '',
      endpoints: edges.length > 1 ? endpointRows(edge, byId) : [],
      topology: states.length > 1 && edge.state && topologyNames[edge.state],
      evidence: groupEvidence(edge.evidence, byId),
    })),
  }))
  return { rows, sections, defaultSections: groups.length === 1 ? [groups[0].kind] : [] }
}
