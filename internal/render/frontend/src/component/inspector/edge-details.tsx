import { useEdgeDetails } from '../../hooks/use-edge-details'
import { Accordion } from '../../ui/accordion'
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
            <p className={styles.note}>{note}</p>
            <div className={styles.connections}>
              {entries.map(({ key, title, endpoints, topology, evidence }) => (
                <div key={key} className={styles.connection}>
                  {title && (
                    <>
                      <h3 className={styles.connectionTitle}>{title}</h3>
                      <Metadata rows={endpoints} />
                    </>
                  )}
                  {topology && <p className={styles.note}>{topology}</p>}
                  <Evidence groups={evidence} />
                </div>
              ))}
            </div>
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
