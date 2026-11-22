import type { Edge, Node, ReactFlowProps } from '@xyflow/react'
import { ReactFlow } from '@xyflow/react'
import { readOnlyFlowOptions } from './flow-canvas.config'

export const FlowCanvas = <FlowNode extends Node, FlowEdge extends Edge>(
  props: ReactFlowProps<FlowNode, FlowEdge>,
) => <ReactFlow<FlowNode, FlowEdge> {...props} {...readOnlyFlowOptions} />
