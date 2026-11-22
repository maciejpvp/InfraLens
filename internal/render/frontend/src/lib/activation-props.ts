import type { KeyboardEvent, MouseEvent } from 'react'

export const activationProps = <T extends HTMLElement | SVGElement>(
  action: (event: KeyboardEvent<T> | MouseEvent<T>) => void,
) => ({
  onClick: action,
  onKeyDown: (event: KeyboardEvent<T>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action(event)
  },
})
