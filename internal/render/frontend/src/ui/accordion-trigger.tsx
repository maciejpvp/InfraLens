'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { ChevronDownIcon } from 'lucide-react'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { accordionStyles } from './accordion.variants'

export const AccordionTrigger = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) => {
  return (
    <AccordionPrimitive.Header className={accordionStyles.header}>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(accordionStyles.trigger, className)}
        {...props}
      >
        {children}
        <ChevronDownIcon className={accordionStyles.icon} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}
