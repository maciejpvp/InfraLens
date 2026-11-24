import type { CostReport } from './features/costs/costs'
import type { EmbeddedGraph, Graph, ServiceIcons } from './lib/graph.types'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { App } from './views/App'
import './theme.css'

const data: EmbeddedGraph = JSON.parse(document.getElementById('infralens-data')!.textContent!)
const graph: Graph = { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] }
const icons: ServiceIcons = JSON.parse(document.getElementById('infralens-icons')!.textContent!)
const costData = document.getElementById('infralens-costs')
const costs: CostReport | undefined = costData ? JSON.parse(costData.textContent!) : undefined
const root = createRoot(document.getElementById('infralens-root')!)

flushSync(() => root.render(<App graph={graph} icons={icons} costs={costs} />))
