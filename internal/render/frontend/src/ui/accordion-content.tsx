'use client'

import type * as React from 'react'
import { AnimatePresence, m, useIsPresent } from 'motion/react'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { disclosureVariants, useMotionTransition } from '../lib/motion'
import { cn } from '../lib/utils'
import { accordionStyles } from './accordion.variants'

export const AccordionContent = ({
  className,
  children,
  open,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content> & { open: boolean }) => {
  return (
    <AccordionPrimitive.Content {...props} forceMount data-slot="accordion-content" className={accordionStyles.content}>
      <AnimatePresence initial={false}>
        {open && <AccordionBody className={className}>{children}</AccordionBody>}
      </AnimatePresence>
    </AccordionPrimitive.Content>
  )
}

function AccordionBody({ className, children }: { className?: string; children: React.ReactNode }) {
  const present = useIsPresent()
  const transition = useMotionTransition('disclosure')

  return (
    <m.div className="overflow-hidden" inert={!present} variants={disclosureVariants}
      initial="closed" animate="open" exit="closed" transition={transition}>
      <div className={cn(accordionStyles.body, className)}>{children}</div>
    </m.div>
  )
}
