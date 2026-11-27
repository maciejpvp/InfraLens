import { Info } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { useState } from 'react'
import { serviceFor } from '../../lib/graph-projection'
import { Icon } from '../../ui/icon'
import type { Catalog, Estimate } from './costs'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 12,
})

const sourceURL = (code: string, region: string) =>
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/' + encodeURIComponent(code) +
  '/current/' + (region === 'global' ? '' : encodeURIComponent(region) + '/') + 'index.csv'

export function CatalogRates({ catalogs }: { catalogs: Record<string, Catalog[]> }) {
  const services = Object.entries(catalogs).map(([id, offers]) => ({
    id, offers, name: serviceFor({ provider: 'aws', service: id }).name,
  })).sort((a, b) => a.name.localeCompare(b.name))
  if (!services.length) return null

  return (
    <details data-motion-details className="mt-3 border-t pt-2">
      <summary className="cursor-pointer font-medium">AWS catalog rates</summary>
      <p className="my-2 max-w-sm text-xs text-muted-foreground">
        Published prices per billing unit. Ranges show prices across AWS products and usage tiers.
      </p>
      {services.map(({ id, name, offers }) => (
        <details data-motion-details key={id} className="border-t py-2 text-xs">
          <summary className="cursor-pointer font-medium">{name}</summary>
          {offers.map((offer) => (
            <div key={(offer.code ?? '') + '/' + offer.region} className="mt-2">
              <div className="mb-1 flex flex-wrap gap-x-2 text-muted-foreground">
                {offer.code && !offer.issue && (
                  <a className="underline underline-offset-2" href={sourceURL(offer.code, offer.region)} target="_blank" rel="noreferrer">
                    {offer.code} CSV
                  </a>
                )}
                <span>{offer.region === 'global' ? 'Global / unscoped' : offer.region}</span>
              </div>
              {offer.issue && <p className="text-muted-foreground">{offer.issue}</p>}
              {offer.rates && (
                <table aria-label={name + ' ' + offer.region + ' unit prices'} className="w-full break-words">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th scope="col" className="pb-1 pr-2 text-left">Product family</th>
                      <th scope="col" className="pb-1 pr-2 text-left">Unit</th>
                      <th scope="col" className="pb-1 text-right">USD per unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offer.rates.map(({ family, unit, min, max }) => (
                      <tr key={(family ?? '') + '/' + unit} className="border-t">
                        <td className="py-1 pr-2">{family || '—'}</td>
                        <td className="py-1 pr-2">{unit}</td>
                        <td className="py-1 text-right tabular-nums">
                          {min === max ? currency.format(min) : currency.format(min) + ' – ' + currency.format(max)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </details>
      ))}
    </details>
  )
}

export function CostStatusTooltip({ value }: { value: Estimate }) {
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
        <Tooltip.Content data-motion-tooltip sideOffset={6} className="z-[60] max-h-60 max-w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-lg border bg-card p-2.5 text-left text-xs font-normal text-foreground shadow-panel">
          <p className="font-semibold">{status}</p>
          <ul className="mt-1 space-y-1 text-muted-foreground wrap-anywhere">
            {value.missing.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
