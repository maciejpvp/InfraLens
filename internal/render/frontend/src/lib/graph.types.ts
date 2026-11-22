export type Change = 'unchanged' | 'create' | 'update' | 'delete' | 'replace'
export type EdgeKind = 'contains' | 'depends_on' | 'connects_to' | 'triggers'
export type Topology = 'before' | 'after'
export type ViewMode = 'flow' | 'infra'

export type Resource = {
  id: string
  name: string
  type: string
  provider?: string
  service?: string
  change?: Change
  stack?: string
  stackRoot?: boolean
}

export type Evidence = {
  source: string
  resource?: string
  property?: string
  label?: string
  details?: string
}

export type GraphEdge = {
  from: string
  to: string
  kind: EdgeKind
  state?: Topology
  evidence: Evidence[]
}

export type Graph = {
  nodes: Resource[]
  edges: GraphEdge[]
  simulated?: boolean
  omittedRelations?: number
}

export type EmbeddedGraph = Omit<Graph, 'nodes' | 'edges'> & {
  schemaVersion: number
  nodes: Resource[] | null
  edges: GraphEdge[] | null
}

export type ResourcesById = ReadonlyMap<string, Resource>
export type ServiceIcons = Record<string, string>

export type Service = {
  id: string
  name: string
  icon: string | null
  color: string
}

type ItemBase = {
  id: string
  name: string
  stack: string
  members: Set<string>
  parent: Group | null
  service?: Service
  support?: boolean
}

export type Group = ItemBase & {
  group: true
  node: Resource | null
  children: HierarchyItem[]
}

type Leaf = ItemBase & {
  group: false
  node: Resource
}

export type HierarchyItem = Group | Leaf
export type ProjectedItem = (Omit<Group, 'children'> | Leaf) & {
  expanded: boolean
  children: string[]
}

export type Hierarchy = {
  roots: Group[]
  items: Map<string, HierarchyItem>
  resourceItems: Map<string, HierarchyItem>
  edges: GraphEdge[]
  flowIDs: Set<string>
  initialExpanded: Set<string>
}

export type ProjectedEdge = Omit<GraphEdge, 'evidence' | 'kind'> & {
  kind: Exclude<EdgeKind, 'contains'>
  originals: GraphEdge[]
}

export type GraphView = {
  items: Map<string, ProjectedItem>
  roots: string[]
  edges: ProjectedEdge[]
  representatives: Map<string, string>
}

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Position = Point & Size & { depth: number }

export type RouteLabel = { text: string; style: { left: number; top: number } }
export type Route = { points: Point[]; d: string; label?: RouteLabel }
export type Layout = Size & { positions: Map<string, Position> }
export type DiagramLayout = { layout: Layout; routes: (Route | null)[] }
export type Scene = DiagramLayout & { tree: Hierarchy; current: GraphView }
