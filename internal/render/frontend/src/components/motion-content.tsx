import { m, useIsPresent } from 'motion/react'
import type { ComponentPropsWithRef } from 'react'
import { contentVariants, useMotionTransition } from '../lib/motion'

export function MotionContent({ hidden, ...props }: ComponentPropsWithRef<typeof m.div>) {
  const present = useIsPresent()
  const transition = useMotionTransition('content')

  return (
    <m.div {...props} hidden={hidden} inert={hidden || !present}
      variants={contentVariants} initial="initial" animate={hidden ? 'initial' : 'visible'}
      exit="exit" transition={transition} />
  )
}
