import { m } from 'motion/react'
import type { ComponentProps } from 'react'
import { useMotionTransition } from '../lib/motion'
import { cn } from '../lib/utils'
import { Button } from '../ui/button'
import { segmentButtonClass } from './overlay-styles'

export function SegmentButton({ group, pressed, variant = 'ghost', className, children, ...props }: ComponentProps<typeof Button> & {
  group: string
  pressed: boolean
}) {
  const transition = useMotionTransition('feedback')

  return (
    <Button {...props} variant={pressed ? 'ghost' : variant} aria-pressed={pressed}
      className={cn(segmentButtonClass, 'relative isolate', pressed && 'text-secondary-foreground hover:bg-transparent dark:hover:bg-transparent', className)}>
      {pressed && (
        <m.span aria-hidden="true" layoutId={transition.duration === 0 ? undefined : group} initial={false} transition={transition}
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-secondary" />
      )}
      {children}
    </Button>
  )
}
