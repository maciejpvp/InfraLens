import type { DiagramNode, DiagramProps, DiagramRelation } from './diagram.types'

import { FlowCanvas } from '../ui/flow-canvas'
import { cameraConfig } from '../hooks/camera.config'
import { useDiagram } from '../hooks/use-diagram'
import { diagramEdgeTypes, diagramNodeTypes } from './diagram.config'
import { diagramStyles as styles } from './diagram.variants'

export const Diagram = (props: DiagramProps) => {
  const { camera } = props
  const { nodes, edges, onEdgeClick } = useDiagram(props)

  return (
    <FlowCanvas<DiagramNode, DiagramRelation>
      id="diagram"
      aria-label="Stacks, components and connections"
      className={styles.root}
      nodes={nodes}
      edges={edges}
      nodeTypes={diagramNodeTypes}
      edgeTypes={diagramEdgeTypes}
      onInit={camera.init}
      onMove={camera.showZoom}
      onEdgeClick={onEdgeClick}
      minZoom={cameraConfig.minZoom}
      maxZoom={cameraConfig.maxZoom}
    />
  )
}
