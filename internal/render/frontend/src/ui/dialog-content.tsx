'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { DialogPortal } from './dialog-portal'
import { DialogOverlay } from './dialog-overlay'
import { dialogStyles } from './dialog.variants'

export const DialogContent = ({
  className,
  children,
  overlayProps,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayProps?: React.ComponentProps<typeof DialogOverlay>
}) => {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay {...overlayProps} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(dialogStyles.content, className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
