import type { Transition, Variants } from 'motion/react'
import { useSyncExternalStore } from 'react'

export const motionTime = {
  hover: 100,
  feedback: 140,
  popover: 140,
  content: 170,
  disclosure: 200,
  workspace: 270,
}

const standard = [0.2, 0, 0, 1] as const
const enter = [0.16, 1, 0.3, 1] as const
const exit = [0.4, 0, 1, 1] as const

export const motionPresets = {
  feedback: { duration: motionTime.feedback / 1000, ease: standard },
  content: { duration: motionTime.content / 1000, ease: standard },
  disclosure: { duration: motionTime.disclosure / 1000, ease: standard },
  workspace: { duration: motionTime.workspace / 1000, ease: standard },
} satisfies Record<string, Transition>

export const motionVariables = {
  '--motion-hover': `${motionTime.hover}ms`,
  '--motion-feedback': `${motionTime.feedback}ms`,
  '--motion-popover': `${motionTime.popover}ms`,
  '--motion-disclosure': `${motionTime.disclosure}ms`,
  '--motion-standard': `cubic-bezier(${standard.join(', ')})`,
  '--motion-enter': `cubic-bezier(${enter.join(', ')})`,
  '--motion-exit': `cubic-bezier(${exit.join(', ')})`,
}

export const contentVariants = {
  initial: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
} satisfies Variants

export const disclosureVariants = {
  closed: { height: 0, opacity: 0 },
  open: { height: 'auto', opacity: 1 },
} satisfies Variants

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const prefersReducedMotion = () => reducedMotion.matches
const subscribeToReducedMotion = (notify: () => void) => {
  reducedMotion.addEventListener('change', notify)
  return () => reducedMotion.removeEventListener('change', notify)
}

export const useMotionTransition = (preset: keyof typeof motionPresets): Transition =>
  useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion) ? { duration: 0 } : motionPresets[preset]

export const navigationDuration = () =>
  prefersReducedMotion() ? 0 : motionTime.workspace
