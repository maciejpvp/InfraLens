import { Text } from '../ui/text'
import type { MouseEventHandler, ReactNode } from 'react'

import { Button } from '../ui/button'
import { inspectorStyles as styles } from './inspector.variants'

export const DetailRow = ({
  title,
  descriptions,
  summary,
  onClick,
}: {
  title: ReactNode
  descriptions?: string
  summary?: string
  onClick: MouseEventHandler<HTMLButtonElement>
}) => (
  <Button variant="outline" onClick={onClick} className={styles.row}>
    {title}
    {descriptions && <Text className={styles.rowCaption}>{descriptions}</Text>}
    {summary && <Text className={styles.rowCaption}>{summary}</Text>}
  </Button>
)
