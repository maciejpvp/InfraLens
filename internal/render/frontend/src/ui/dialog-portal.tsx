'use client'

import type * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

export const DialogPortal = ({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) => {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}
