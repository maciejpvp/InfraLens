import { m, useIsPresent } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMotionTransition } from '../lib/motion'

const variants = {
  split: { '--dock-open': 1, '--dock-maximized': 0 },
  maximized: { '--dock-open': 1, '--dock-maximized': 1 },
  closed: { '--dock-open': 0 },
}

export function Dock({ kind, maximized = false, children }: {
  kind: 'inspector' | 'cost'
  maximized?: boolean
  children: (present: boolean, resizable: boolean) => ReactNode
}) {
  const present = useIsPresent()
  const transition = useMotionTransition('workspace')
  const [settled, setSettled] = useState(false)
  const readyFrame = useRef(0)
  const target = maximized ? 'maximized' : 'split'

  useLayoutEffect(() => {
    setSettled(false)
    return () => cancelAnimationFrame(readyFrame.current)
  }, [target, present])

  return (
    <m.div
      className={`report-${kind}-slot`}
      inert={!present}
      initial={transition.duration === 0 ? false : { '--dock-open': 0, '--dock-maximized': maximized ? 1 : 0 }}
      variants={variants}
      animate={target}
      exit="closed"
      transition={transition}
      onAnimationComplete={(variant) => {
        if (variant === target) {
          cancelAnimationFrame(readyFrame.current)
          readyFrame.current = requestAnimationFrame(() => setSettled(present))
        }
      }}
    >
      {children(present, present && !maximized && (settled || transition.duration === 0))}
    </m.div>
  )
}
