'use client'

import type * as React from 'react'
import { cn } from '../lib/utils'
import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { checkboxStyles } from './checkbox.variants'

export const Checkbox = ({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) => {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox" className={cn(checkboxStyles.root, className)} {...props}>
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className={checkboxStyles.indicator}>
        <CheckIcon className={checkboxStyles.icon} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
