'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { dialogStyles } from './dialog.variants'

export const DialogOverlay = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) => {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(dialogStyles.overlay, className)}
      {...props}
    />
  )
}
