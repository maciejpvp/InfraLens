import type { Catalog } from '../lib/costs'
import { serviceFor } from '../lib/graph-projection'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 12,
})

const sourceURL = (code: string, region: string) =>
  'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/' + encodeURIComponent(code) +
  '/current/' + (region === 'global' ? '' : encodeURIComponent(region) + '/') + 'index.csv'

export const CatalogRates = ({ catalogs }: { catalogs: Record<string, Catalog[]> }) => {
  const services = Object.entries(catalogs).map(([id, offers]) => ({
    id, offers, name: serviceFor({ provider: 'aws', service: id }).name,
  })).sort((a, b) => a.name.localeCompare(b.name))
  if (!services.length) return null

  return (
    <details className="mt-3 border-t pt-2">
      <summary className="cursor-pointer font-medium">AWS catalog rates</summary>
      <p className="my-2 max-w-sm text-xs text-muted-foreground">
        Published prices per billing unit. Ranges show prices across AWS products and usage tiers.
      </p>
      {services.map(({ id, name, offers }) => (
        <details key={id} className="border-t py-2 text-xs">
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
