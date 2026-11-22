import type { ReactNode } from 'react'

import { AccordionContent } from '../ui/accordion-content'
import { AccordionItem } from '../ui/accordion-item'
import { AccordionTrigger } from '../ui/accordion-trigger'
import { inspectorStyles as styles } from './inspector.variants'

export const DetailSection = ({
  value,
  title,
  children,
}: {
  value: string
  title: string
  children: ReactNode
}) => (
  <AccordionItem value={value} className={styles.section}>
    <AccordionTrigger className={styles.sectionTitle}>{title}</AccordionTrigger>
    <AccordionContent className={styles.sectionBody}>{children}</AccordionContent>
  </AccordionItem>
)
