import type { ComponentPropsWithRef } from 'react'
import { Label as LabelPrimitive } from 'radix-ui'

export const Label = (props: ComponentPropsWithRef<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root data-slot="label" {...props} />
)
