import type { EmbeddedGraph, Graph, ServiceIcons } from './lib/graph.types'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ReportView } from './views/report-view'
import './theme.css'

const data: EmbeddedGraph = JSON.parse(document.getElementById('infralens-data')!.textContent!)
const graph: Graph = { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] }
const icons: ServiceIcons = JSON.parse(document.getElementById('infralens-icons')!.textContent!)
const root = createRoot(document.getElementById('infralens-root')!)

flushSync(() => root.render(<ReportView graph={graph} icons={icons} />))
