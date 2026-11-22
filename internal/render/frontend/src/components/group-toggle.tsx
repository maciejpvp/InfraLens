import type { useDiagramItem } from '../hooks/use-diagram-item'

import { Button } from '../ui/button'
import { diagramStyles as styles } from './diagram.variants'

export const GroupToggle = ({
  id,
  expanded,
  ariaLabel,
  symbol,
  events,
}: NonNullable<ReturnType<typeof useDiagramItem>['toggleProps']>) => (
  <Button
    type="button"
    variant="outline"
    data-toggle={id}
    aria-label={ariaLabel}
    aria-expanded={expanded}
    className={styles.toggle}
    {...events}
  >
    {symbol}
  </Button>
)
