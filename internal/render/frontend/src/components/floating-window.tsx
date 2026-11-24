'use client'

import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '../lib/utils'
import { DialogPortal } from '../ui/dialog-portal'
import { dialogStyles } from '../ui/dialog.variants'

export function FloatingWindow({
  className,
  ...props
}: ComponentPropsWithRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(dialogStyles.window, className)}
        {...props}
      />
    </DialogPortal>
  )
}
