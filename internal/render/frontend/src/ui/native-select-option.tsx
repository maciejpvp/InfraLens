import type * as React from 'react'
import { cn } from '../lib/utils'
import { nativeSelectStyles } from './native-select.variants'

export const NativeSelectOption = ({ className, ...props }: React.ComponentProps<'option'>) => {
  return (
    <option
      data-slot="native-select-option"
      className={cn(nativeSelectStyles.option, className)}
      {...props}
    />
  )
}
