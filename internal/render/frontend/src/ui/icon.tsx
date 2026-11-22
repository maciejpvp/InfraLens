import type { LucideIcon, LucideProps } from 'lucide-react'

export const Icon = ({ icon: Symbol, ...props }: LucideProps & { icon: LucideIcon }) => (
  <Symbol aria-hidden="true" {...props} />
)
