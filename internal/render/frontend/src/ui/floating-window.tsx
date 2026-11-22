'use client'

import type { ComponentPropsWithRef } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '../lib/utils'
import { DialogPortal } from './dialog-portal'
import { dialogStyles } from './dialog.variants'

export const FloatingWindow = ({
  className,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Content>) => (
  <DialogPortal>
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn(dialogStyles.window, className)}
      {...props}
    />
  </DialogPortal>
)
