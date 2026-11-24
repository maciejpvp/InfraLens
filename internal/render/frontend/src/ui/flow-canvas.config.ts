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
  // React Flow adds its no-pan class to edges. Restrict the selector to our controls.
  noPanClassName: 'nopan:is(button)',
  paneDragThreshold: 4,
  zIndexMode: 'manual',
  proOptions: { hideAttribution: true },
} satisfies ReactFlowProps
