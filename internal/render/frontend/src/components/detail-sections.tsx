import { createContext, useContext, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Accordion } from '../ui/accordion'
import { AccordionContent } from '../ui/accordion-content'
import { AccordionItem } from '../ui/accordion-item'
import { AccordionTrigger } from '../ui/accordion-trigger'
import { Box } from '../ui/box'
import { List } from '../ui/list'
import { Text } from '../ui/text'
import { ServiceIcon } from './service-icon'

export type MetadataRow = [label: string, value: string, icon?: string, valueClass?: string]

const styles = {
  metadata: 'mb-2 space-y-1.5 border-b py-2.5',
  metadataRow: 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-baseline gap-2',
  metadataLabel: 'flex items-center gap-1.5 text-xs leading-snug text-muted-foreground [&_img]:size-4',
  metadataValue: 'text-right text-xs leading-snug font-medium wrap-anywhere tabular-nums',
  section: 'border-b last:border-b-0',
  sectionTitle: 'min-h-8 items-center rounded-sm px-1.5 py-1.5 text-xs font-semibold hover:bg-accent hover:no-underline',
  sectionBody: 'pb-1',
}

const OpenSections = createContext<readonly string[]>([])

export function DetailSections({
  value, defaultValue, onValueChange, ...props
}: Extract<ComponentProps<typeof Accordion>, { type: 'multiple' }>) {
  const [local, setLocal] = useState(defaultValue ?? [])
  const open = value ?? local

  return (
    <OpenSections value={open}>
      <Accordion {...props} value={open} onValueChange={(next: string[]) => {
        if (value === undefined) setLocal(next)
        onValueChange?.(next)
      }} />
    </OpenSections>
  )
}

export function DetailSection({
  value,
  title,
  children,
}: {
  value: string
  title: ReactNode
  children: ReactNode
}) {
  const open = useContext(OpenSections).includes(value)

  return (
    <AccordionItem value={value} className={styles.section}>
      <AccordionTrigger className={styles.sectionTitle}>{title}</AccordionTrigger>
      <AccordionContent open={open} className={styles.sectionBody}>{children}</AccordionContent>
    </AccordionItem>
  )
}

export function Metadata({ rows }: { rows: MetadataRow[] }) {
  return (
    <List as="dl" className={styles.metadata}>
      {rows.map(([label, value, icon, valueClass]) => (
        <Box key={label} className={styles.metadataRow}>
          <Text as="dt" className={styles.metadataLabel}>
            {icon !== undefined && <ServiceIcon icon={icon} />}
            {label}
          </Text>
          <Text as="dd" className={valueClass ? `${styles.metadataValue} ${valueClass}` : styles.metadataValue}>
            {value}
          </Text>
        </Box>
      ))}
    </List>
  )
}
