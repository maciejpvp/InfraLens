import type * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '../lib/utils'

import { buttonVariants } from './button.variants'

export const Button = ({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  unstyled = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; unstyled?: boolean }) => {
  const Element = asChild ? Slot.Root : 'button'

  return (
    <Element
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={unstyled ? className : cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
