import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import type { CostReport } from './features/costs/costs'
import type { EmbeddedGraph, Graph, ServiceIcons } from './lib/graph.types'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { motionPresets, motionVariables } from './lib/motion'
import { App } from './views/App'
import './theme.css'

const data: EmbeddedGraph = JSON.parse(document.getElementById('laytrace-data')!.textContent!)
const graph: Graph = { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] }
const icons: ServiceIcons = JSON.parse(document.getElementById('laytrace-icons')!.textContent!)
const costData = document.getElementById('laytrace-costs')
const costs: CostReport | undefined = costData ? JSON.parse(costData.textContent!) : undefined
const root = createRoot(document.getElementById('laytrace-root')!)

for (const [name, value] of Object.entries(motionVariables)) {
  document.documentElement.style.setProperty(name, value)
}

flushSync(() => root.render(
  <LazyMotion features={domMax} strict>
    <MotionConfig transition={motionPresets.content} reducedMotion="user">
      <App graph={graph} icons={icons} costs={costs} />
    </MotionConfig>
  </LazyMotion>,
))
