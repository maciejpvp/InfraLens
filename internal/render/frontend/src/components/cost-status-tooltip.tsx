import { useState } from 'react'
import { Info } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import type { Estimate } from '../lib/costs'
import { Icon } from '../ui/icon'

export const CostStatusTooltip = ({ value }: { value: Estimate }) => {
  const [open, setOpen] = useState(false)
  if (!value.missing.length) return null
  const status = value.priced ? 'Partial estimate' : 'Estimate unavailable'
  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={status}
          className="inline-grid size-5 place-items-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline-ring"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setOpen(true)
          }}>
          <Icon icon={Info} size={13} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-[60] max-h-60 max-w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-lg border bg-card p-2.5 text-left text-xs font-normal text-foreground shadow-panel">
          <p className="font-semibold">{status}</p>
          <ul className="mt-1 space-y-1 text-muted-foreground wrap-anywhere">
            {value.missing.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
