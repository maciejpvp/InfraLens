import { Box } from '../ui/box'
import { Text } from '../ui/text'
import { useEdgeDetails } from '../hooks/use-edge-details'
import { Accordion } from '../ui/accordion'
import { DetailSection } from './detail-section'
import { Evidence } from './evidence'
import { Metadata } from './metadata'
import { inspectorStyles as styles } from './inspector.variants'

export const EdgeDetails = (props: Parameters<typeof useEdgeDetails>[0]) => {
  const { rows, sections, defaultSections } = useEdgeDetails(props)
  return (
    <>
      <Metadata rows={rows} />
      <Accordion type="multiple" defaultValue={defaultSections} className={styles.sections}>
        {sections.map(({ kind, title, note, entries }) => (
          <DetailSection key={kind} value={kind} title={title}>
            <Text as="p" className={styles.note}>
              {note}
            </Text>
            <Box className={styles.connections}>
              {entries.map(({ key, title, endpoints, topology, evidence }) => (
                <Box key={key} className={styles.connection}>
                  {title && (
                    <>
                      <Text as="h3" className={styles.connectionTitle}>
                        {title}
                      </Text>
                      <Metadata rows={endpoints} />
                    </>
                  )}
                  {topology && (
                    <Text as="p" className={styles.note}>
                      {topology}
                    </Text>
                  )}
                  <Evidence groups={evidence} />
                </Box>
              ))}
            </Box>
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
