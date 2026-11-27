import { m } from 'motion/react'
import { useMemo } from 'react'
import { DetailSection, DetailSections } from '../../components/detail-sections'
import { ServiceIcon } from '../../components/service-icon'
import { serviceFor } from '../../lib/graph-projection'
import type { Change, Resource, Service, ServiceIcons } from '../../lib/graph.types'
import { changeLabels, countChanges, countLabel, serviceIconSrc } from '../../lib/graph-view'
import { useMotionTransition } from '../../lib/motion'

const detailsMotion = {
  closed: { y: -6 },
  open: { y: 0 },
}

export function ChangeSummary({ resources, icons }: { resources: Resource[]; icons: ServiceIcons }) {
  const transition = useMotionTransition('content')
  const { summary, groups } = useMemo(() => {
    const groups = new Map<string, { service: Service; resources: (Resource & { change: Change })[] }>()
    for (const resource of resources) {
      const { change } = resource
      if (!change || change === 'unchanged') continue
      const service = serviceFor(resource)
      const group = groups.get(service.id)
      if (group) group.resources.push({ ...resource, change })
      else groups.set(service.id, { service, resources: [{ ...resource, change }] })
    }
    return {
      summary: countChanges(resources),
      groups: [...groups.values()].sort((a, b) => a.service.name.localeCompare(b.service.name)),
    }
  }, [resources])

  if (!summary) return null

  return (
    <section id="change-summary" aria-label="Resource changes"
      className="absolute top-3 left-3 z-10 max-h-[calc(100%-1.5rem)] w-max max-w-[min(24rem,calc(100%-1.5rem))] cursor-auto touch-auto overflow-auto overscroll-contain rounded-sm border bg-card text-xs text-muted-foreground tabular-nums [scrollbar-gutter:stable] [&_[data-slot=accordion-content]]:[contain:inline-size]">
      <DetailSections type="multiple">
        <DetailSection value="changes" title={`${summary} · all resources`}>
          <m.div variants={detailsMotion} transition={transition}>
            {groups.map(({ service, resources }) => (
              <section key={service.id} className="border-t px-2 py-1.5">
                <h3 className="flex items-center gap-1.5 font-semibold text-foreground [&_.service-icon]:size-4">
                  <ServiceIcon icon={serviceIconSrc(service, icons)} />
                  {service.name} · {countLabel(resources.length, 'resource')}
                </h3>
                <ul className="mt-1 divide-y">
                  {resources.map(({ id, name, type, stack, change }) => (
                    <li key={id} className="py-1 wrap-anywhere">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-foreground">{name}</span>
                        <span className={`shrink-0 change-${change}`}>{changeLabels[change]}</span>
                      </div>
                      <div>{type}{stack && ` · ${stack}`}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </m.div>
        </DetailSection>
      </DetailSections>
    </section>
  )
}
