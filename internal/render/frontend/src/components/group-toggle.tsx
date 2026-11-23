import type { useDiagramItem } from '../hooks/use-diagram-item'

import { Button } from '../ui/button'

export const GroupToggle = ({
  id,
  expanded,
  ariaLabel,
  symbol,
  events,
  className,
}: NonNullable<ReturnType<typeof useDiagramItem>['toggleProps']>) => (
  <Button
    type="button"
    variant="outline"
    data-toggle={id}
    aria-label={ariaLabel}
    aria-expanded={expanded}
    className={className}
    {...events}
  >
    {symbol}
  </Button>
)
