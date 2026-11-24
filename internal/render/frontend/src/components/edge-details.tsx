import { Text } from '../ui/text'
import type { GraphEdge } from '../lib/graph.types'
import type { Endpoint } from '../lib/relation-groups'
import { useEdgeDetails } from '../hooks/use-edge-details'
import { Accordion } from '../ui/accordion'
import { DetailSection } from './detail-section'
import { ConnectionEntries } from './connection-entries'
import { DependencyGroups } from './dependency-groups'
import { RelationGroups } from './relation-groups'
import { Metadata } from './metadata'
import { inspectorStyles as styles } from './inspector.variants'

export const EdgeDetails = (props: Parameters<typeof useEdgeDetails>[0]) => {
  const { byId, icons } = props
  const { rows, sections, toEntry, defaultSections } = useEdgeDetails(props)
  const renderEntries = (edges: GraphEdge[], shared?: Endpoint) => (
    <ConnectionEntries edges={edges} byId={byId} icons={icons} shared={shared} toEntry={toEntry} />
  )
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
              <DependencyGroups edges={edges} byId={byId} icons={icons}>
                {renderEntries}
              </DependencyGroups>
            ) : kind === 'triggers' || kind === 'connects_to' ? (
              <RelationGroups edges={edges} byId={byId} icons={icons}>
                {renderEntries}
              </RelationGroups>
            ) : renderEntries(edges)}
          </DetailSection>
        ))}
      </Accordion>
    </>
  )
}
