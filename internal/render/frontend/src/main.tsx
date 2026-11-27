import type { CostReport } from './features/costs/costs'
import type { EmbeddedGraph, Graph, ServiceIcons } from './lib/graph.types'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { App } from './views/App'
import './theme.css'

const data: EmbeddedGraph = JSON.parse(document.getElementById('laytrace-data')!.textContent!)
const graph: Graph = { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] }
const icons: ServiceIcons = JSON.parse(document.getElementById('laytrace-icons')!.textContent!)
const costData = document.getElementById('laytrace-costs')
const costs: CostReport | undefined = costData ? JSON.parse(costData.textContent!) : undefined
const root = createRoot(document.getElementById('laytrace-root')!)

flushSync(() => root.render(<App graph={graph} icons={icons} costs={costs} />))
