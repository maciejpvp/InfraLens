import type * as React from 'react'
import { cn } from '../lib/utils'
import { ChevronDownIcon } from 'lucide-react'
import { nativeSelectStyles } from './native-select.variants'

export const NativeSelect = ({
  className,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) => {
  return (
    <div className={nativeSelectStyles.wrapper} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          nativeSelectStyles.select,
          nativeSelectStyles.focus,
          nativeSelectStyles.invalid,
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className={nativeSelectStyles.icon}
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}
