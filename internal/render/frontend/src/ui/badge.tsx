import type * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '../lib/utils'

import { badgeVariants } from './badge.variants'

export const Badge = ({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) => {
  const Element = asChild ? Slot.Root : 'span'

  return (
    <Element
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}
