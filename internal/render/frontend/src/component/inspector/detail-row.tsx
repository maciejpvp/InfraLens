import type { MouseEventHandler } from 'react'

import { Button } from '../../ui/button'
import { inspectorStyles as styles } from './inspector.variants'

export const DetailRow = ({
  title,
  descriptions,
  summary,
  onClick,
}: {
  title: string
  descriptions?: string
  summary?: string
  onClick: MouseEventHandler<HTMLButtonElement>
}) => (
  <Button variant="outline" onClick={onClick} className={styles.row}>
    {title}
    {descriptions && <span className={styles.rowCaption}>{descriptions}</span>}
    {summary && <span className={styles.rowCaption}>{summary}</span>}
  </Button>
)
