'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { dialogStyles } from './dialog.variants'

export const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) => {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(dialogStyles.title, className)}
      {...props}
    />
  )
}
