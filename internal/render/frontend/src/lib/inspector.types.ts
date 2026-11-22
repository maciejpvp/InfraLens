import type { GraphEdge, HierarchyItem } from './graph.types'

type PageState = {
  ids: string[]
  edges: GraphEdge[]
  trigger?: HTMLButtonElement
  scroll?: number
}

export type InspectorPage = PageState & ({ item: HierarchyItem; links: GraphEdge[] } | { item?: undefined })

export type InspectorOrigin = string | { edge: string }
export type OpenResource = (id: string, trigger?: HTMLButtonElement) => void
export type OpenRelation = (edges: GraphEdge[], trigger: HTMLButtonElement) => void
export type MetadataRow = [label: string, value: string]

export type EvidenceGroup = {
  key: string
  label?: string
  details?: string
  entries: { source: string; resource?: string; property: string }[]
}
