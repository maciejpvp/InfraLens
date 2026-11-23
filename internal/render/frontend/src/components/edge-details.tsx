import { Text } from '../ui/text'
import { useEdgeDetails } from '../hooks/use-edge-details'
import { Accordion } from '../ui/accordion'
import { DetailSection } from './detail-section'
import { ConnectionEntries } from './connection-entries'
import { DependencyGroups } from './dependency-groups'
import { Metadata } from './metadata'
import { inspectorStyles as styles } from './inspector.variants'

export const EdgeDetails = (props: Parameters<typeof useEdgeDetails>[0]) => {
  const { rows, sections, toEntry, defaultSections } = useEdgeDetails(props)
  return (
    <>
      <Metadata rows={rows} />
      <Accordion type="multiple" defaultValue={defaultSections} className={styles.sections}>
        {sections.map(({ kind, title, note, edges }) => (
          <DetailSection key={kind} value={kind} title={title}>
            <Text as="p" className={styles.note}>
              {note}
            </Text>
            {kind === 'depends_on' && props.edges.length > 1 ? (
              <DependencyGroups edges={edges} byId={props.byId} icons={props.icons}>
                {(group) => <ConnectionEntries edges={group} toEntry={toEntry} />}
              </DependencyGroups>
            ) : <ConnectionEntries edges={edges} toEntry={toEntry} />}
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
