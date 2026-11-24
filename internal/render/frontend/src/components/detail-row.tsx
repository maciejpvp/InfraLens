import type { MouseEventHandler, ReactNode } from 'react'

import { Button } from '../ui/button'
import { inspectorStyles as styles } from './inspector.variants'

export const DetailRow = ({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: MouseEventHandler<HTMLButtonElement>
}) => (
  <Button variant="outline" onClick={onClick} className={styles.row}>
    {children}
  </Button>
)
