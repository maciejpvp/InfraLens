import type { ComponentProps, ReactNode } from 'react'
import { Accordion } from '../ui/accordion'
import { AccordionContent } from '../ui/accordion-content'
import { AccordionItem } from '../ui/accordion-item'
import { AccordionTrigger } from '../ui/accordion-trigger'
import { Box } from '../ui/box'
import { List } from '../ui/list'
import { Text } from '../ui/text'
import { ServiceIcon } from './service-icon'

export type MetadataRow = [label: string, value: string, icon?: string]

const styles = {
  metadata: 'mb-3 grid grid-cols-2 gap-1.5',
  metadataRow: 'min-w-0 rounded-[.85rem] bg-highlight/5 px-2.5 py-2',
  metadataLabel: 'flex items-center gap-1.5 text-[.6875rem] leading-tight font-medium tracking-wide text-muted-foreground [&_img]:size-4',
  metadataValue: 'mt-0.5 text-xs leading-relaxed font-medium wrap-anywhere',
  section: 'overflow-hidden rounded-[1rem] border border-highlight/10 bg-background/25 last:border-b',
  sectionTitle: 'min-h-10 rounded-none px-3 py-2.5 text-xs hover:bg-accent/55 hover:no-underline',
  sectionBody: 'px-2.5 pb-2.5',
}

export function DetailSections(props: ComponentProps<typeof Accordion>) {
  return (
    <Accordion className="space-y-2" {...props} />
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
  return (
    <AccordionItem value={value} className={styles.section}>
      <AccordionTrigger className={styles.sectionTitle}>{title}</AccordionTrigger>
      <AccordionContent className={styles.sectionBody}>{children}</AccordionContent>
    </AccordionItem>
  )
}

export function Metadata({ rows }: { rows: MetadataRow[] }) {
  return (
    <List as="dl" className={styles.metadata}>
      {rows.map(([label, value, icon]) => (
        <Box key={label} className={styles.metadataRow}>
          <Text as="dt" className={styles.metadataLabel}>
            {icon !== undefined && <ServiceIcon icon={icon} />}
            {label}
          </Text>
          <Text as="dd" className={styles.metadataValue}>
            {value}
          </Text>
        </Box>
      ))}
    </List>
  )
}
