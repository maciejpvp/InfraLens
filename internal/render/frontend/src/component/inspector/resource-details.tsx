import { useResourceDetails } from '../../hooks/use-resource-details'
import { Accordion } from '../../ui/accordion'
import { DetailRow } from './detail-row'
import { DetailSection } from './detail-section'
import { Metadata } from './metadata'
import { inspectorStyles as styles } from './inspector.variants'

export const ResourceDetails = (props: Parameters<typeof useResourceDetails>[0]) => {
  const { rows, resourceGroup, relations } = useResourceDetails(props)
  return (
    <>
      <Metadata rows={rows} />
      <Accordion type="multiple" className={styles.sections}>
        {resourceGroup && (
          <DetailSection value="members" title={resourceGroup.title}>
            <div className={styles.rows}>
              {resourceGroup.entries.map(({ id, ...entry }) => (
                <DetailRow key={id} {...entry} />
              ))}
            </div>
          </DetailSection>
        )}
        {relations.map(({ kind, title, entries }) => (
          <DetailSection key={kind} value={kind} title={title}>
            <div className={styles.rows}>
              {entries.map(({ id, ...entry }) => (
                <DetailRow key={id} {...entry} />
              ))}
            </div>
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
