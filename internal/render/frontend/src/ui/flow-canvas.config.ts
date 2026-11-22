import type { ReactFlowProps } from '@xyflow/react'

export const readOnlyFlowOptions = {
  nodesDraggable: false,
  nodesConnectable: false,
  nodesFocusable: false,
  edgesReconnectable: false,
  elementsSelectable: false,
  autoPanOnNodeFocus: false,
  deleteKeyCode: null,
  selectionKeyCode: null,
  zoomOnDoubleClick: false,
  zIndexMode: 'manual',
  proOptions: { hideAttribution: true },
} satisfies ReactFlowProps
