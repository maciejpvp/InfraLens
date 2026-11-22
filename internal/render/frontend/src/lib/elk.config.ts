import { GROUP_HEADER_HEIGHT } from './layout.config.ts'

export const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.json.shapeCoords': 'ROOT',
  'elk.json.edgeCoords': 'ROOT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '28',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
  'elk.spacing.edgeEdge': '18',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
  'elk.spacing.portPort': '18',
  'elk.layered.mergeEdges': 'false',
  'elk.layered.mergeHierarchyEdges': 'false',
}

export const elkGroupOptions = {
  'elk.padding': `[top=${GROUP_HEADER_HEIGHT + 20},left=20,bottom=20,right=20]`,
}

export const edgeCaptionFontSize = 12
export const edgeCaptionHeight = 16
export const edgeCaptionPadding = 4
