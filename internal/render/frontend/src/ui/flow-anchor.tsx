import type { ComponentProps } from 'react'
import { Handle } from '@xyflow/react'

export const FlowAnchor = (props: Pick<ComponentProps<typeof Handle>, 'type' | 'position' | 'className'>) => (
  <Handle {...props} isConnectable={false} />
)
