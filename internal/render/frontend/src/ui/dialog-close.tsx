'use client'

import type * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

export const DialogClose = ({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) => {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}
