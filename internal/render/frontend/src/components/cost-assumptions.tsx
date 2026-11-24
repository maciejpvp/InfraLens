import { useId, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { assumptionKey, assumptions, initialAssumption, usageAssumptions } from '../lib/costs'
import type { CostReport, Scenario } from '../lib/costs'
import type { Topology } from '../lib/graph.types'
import { Input } from '../ui/input'

export const CostAssumptions = ({
  report, scenario, setScenario, side,
}: {
  report: CostReport
  scenario: Scenario
  setScenario: Dispatch<SetStateAction<Scenario>>
  side?: Topology
}) => {
  const inputId = useId()
  const imported = report.usageAssumptions
  const split = Boolean(imported && report.before)
  const panels = useMemo(() => {
    const sides: (Topology | undefined)[] = split ? (side ? [side] : ['before', 'after']) : [undefined]
    return sides.map((state) => ({ state, controls: usageAssumptions(report, state) }))
  }, [report, side, split])
  if (!imported && !panels.some(({ controls }) => controls.length)) return null

  return (
    <details className="mt-3 border-t pt-2">
      <summary className="cursor-pointer font-medium">
        Usage assumptions{imported && ' · Imported'}
      </summary>
      {imported?.scenario && <p className="mt-2 max-w-96 break-words text-xs">{imported.scenario}</p>}
      <p className="my-2 max-w-96 text-xs text-muted-foreground">
        Enter billable operations or units for one incoming request.
        {split ? ' Each state can use different values.' : report.before && ' Both states use the same assumptions.'}
      </p>
      {imported?.warnings?.length ? (
        <ul className="mb-2 max-w-96 space-y-1 text-xs text-amber-300">
          {imported.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
      {panels.map(({ state, controls }) => {
        const source = state === 'before' ? imported?.baseline : imported?.target
        return (
          <section key={state ?? 'shared'} className="mb-2">
            {state && <h3 className="pt-1 font-medium">{state === 'before' ? 'Before' : 'After'}</h3>}
            {source && <p className="my-1 max-w-96 break-words text-xs text-muted-foreground">Assumptions source {source}</p>}
            {controls.map(({ item, inputs }) => (
              <fieldset key={item.id} className="flex flex-wrap gap-2 border-t py-1">
                <legend className="max-w-60 break-words pr-2 text-xs">{item.name}</legend>
                {[...inputs].map((input) => {
                  const key = assumptionKey(item.id, input, state)
                  const { label, max } = assumptions[input]
                  const initial = initialAssumption(item, input)
                  const id = inputId + key
                  return (
                    <label key={input} htmlFor={id} className="grid w-36 gap-1 text-xs text-muted-foreground">
                      {label}
                      <Input
                        id={id} type="number" min={0} max={max} step="any" value={scenario[key] ?? initial}
                        placeholder={String(initial)} className="h-8"
                        onChange={(event) => {
                          const value = event.target.value
                          setScenario((previous) => ({ ...previous, [key]: value && Number(value) > max ? String(max) : value }))
                        }}
                      />
                    </label>
                  )
                })}
              </fieldset>
            ))}
          </section>
        )
      })}
    </details>
  )
}
