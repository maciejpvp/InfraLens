import type { DiagramNode, DiagramProps, DiagramRelation } from './diagram.types'

import { memo } from 'react'
import { clsx } from 'clsx'
import { FlowCanvas } from '../ui/flow-canvas'
import { cameraConfig } from '../hooks/camera.config'
import { useDiagram } from '../hooks/use-diagram'
import { diagramEdgeTypes, diagramNodeTypes } from './diagram.config'
import { diagramStyles as styles } from './diagram.variants'

export const Diagram = memo(function Diagram(props: DiagramProps) {
  const { nodes, edges, onEdgeClick, dense } = useDiagram(props)

  return (
    <FlowCanvas<DiagramNode, DiagramRelation>
      id="diagram"
      aria-label="Stacks, components and connections"
      className={clsx(styles.root, dense && 'dense-diagram')}
      nodes={nodes}
      edges={edges}
      nodeTypes={diagramNodeTypes}
      edgeTypes={diagramEdgeTypes}
      onInit={props.init}
      onMove={props.showZoom}
      onEdgeClick={onEdgeClick}
      minZoom={cameraConfig.minZoom}
      maxZoom={cameraConfig.maxZoom}
    />
  )
})
