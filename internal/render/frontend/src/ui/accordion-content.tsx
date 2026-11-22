'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { accordionStyles } from './accordion.variants'

export const AccordionContent = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) => {
  return (
    <AccordionPrimitive.Content data-slot="accordion-content" className={accordionStyles.content} {...props}>
      <div className={cn(accordionStyles.body, className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}
