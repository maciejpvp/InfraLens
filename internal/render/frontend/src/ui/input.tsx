import type * as React from 'react'
import { cn } from '../lib/utils'
import { inputStyles } from './input.variants'

export const Input = ({ className, type, ...props }: React.ComponentProps<'input'>) => {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputStyles.base, inputStyles.focus, inputStyles.invalid, className)}
      {...props}
    />
  )
}
