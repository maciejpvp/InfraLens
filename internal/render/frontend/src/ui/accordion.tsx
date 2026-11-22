'use client'

import type * as React from 'react'
import { Accordion as AccordionPrimitive } from 'radix-ui'

export const Accordion = ({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) => {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}
