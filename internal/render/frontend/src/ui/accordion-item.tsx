'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { accordionStyles } from './accordion.variants'

export const AccordionItem = ({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) => {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(accordionStyles.item, className)}
      {...props}
    />
  )
}
