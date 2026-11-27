import { ArrowDown, ArrowRight, ChevronRight } from 'lucide-react'
import { type MouseEventHandler, type ReactNode, Fragment } from 'react'
import { DetailSection, DetailSections, Metadata } from '../../components/detail-sections'
import { ServiceIcon } from '../../components/service-icon'
import { serviceFor } from '../../lib/graph-projection'
import { changeLabels, countLabel } from '../../lib/graph-view'
import type { EdgeKind, GraphEdge, ResourcesById, ServiceIcons } from '../../lib/graph.types'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Icon } from '../../ui/icon'
import { List } from '../../ui/list'
import { ListItem } from '../../ui/list-item'
import { Text } from '../../ui/text'
import type { EdgeDetailsProps, EvidenceGroup, ResourceDetailsOptions } from './describe-details'
import { describeEdges, describeResource, inspectorServiceIconSrc } from './describe-details'
import { type Endpoint, groupBySharedEndpoint, groupDependenciesByService } from './relation-groups'

const styles = {
  dependencyTitle: 'flex min-w-0 flex-wrap items-center gap-1.5 [&_img]:size-4',
  rows: 'space-y-1',
  row: 'connection-item block h-auto min-h-10 w-full rounded-xl border-highlight/10 bg-highlight/5 px-2.5 py-2 text-left text-xs whitespace-normal wrap-anywhere motion-safe:active:scale-[.99]',
  memberRow: 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2',
  rowName: 'block min-w-0 font-semibold leading-snug select-text',
  relationEndpoint: 'flex min-w-0 items-center gap-1.5 [&_img]:size-4',
  rowCaption: 'mt-1 block text-[.6875rem] leading-normal text-muted-foreground',
  relationCaption: 'mt-2 block border-t border-highlight/10 pt-1.5 text-[.6875rem] leading-normal text-muted-foreground',
  note: 'mb-2 text-xs leading-relaxed text-muted-foreground',
  connections: 'space-y-2',
  connection: 'space-y-2',
  connectionTitle: 'text-sm font-semibold',
  evidenceGroup: 'space-y-1 rounded-xl bg-highlight/[.045] p-2.5',
  evidenceTitle: 'text-xs font-semibold',
  evidenceDetails: 'text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground',
  evidenceList: 'space-y-1.5 text-xs text-muted-foreground',
  evidenceEntry: 'rounded-lg bg-background/30 px-2 py-1.5',
  evidenceProperty:
    'mt-1 block rounded-lg bg-background/75 px-2 py-1.5 font-mono whitespace-pre-wrap text-foreground',
}

export function ResourceDetails({ icons, ...props }: ResourceDetailsOptions & { icons: ServiceIcons }) {
  const { byId } = props
  const { rows, resourceGroup, relations, toRow } = describeResource(props)
  const renderRows = (edges: GraphEdge[], shared?: Endpoint) => (
    <RelationRows edges={edges} byId={byId} icons={icons} shared={shared} toRow={toRow} />
  )
  return (
    <>
      <Metadata rows={rows} />
      <DetailSections type="multiple">
        {resourceGroup && (
          <DetailSection value="members" title={resourceGroup.title}>
            <Box className={styles.rows}>
              {resourceGroup.entries.map(({ id, resource, onClick }) => (
                <DetailRow key={id} onClick={onClick}>
                  <Text className={styles.memberRow}>
                    <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(resource), icons)} />
                    <Text className="min-w-0">
                      <Text data-member-id={id} className={styles.rowName}>
                        <ResourceName name={resource.name} />
                      </Text>
                      <Text className={styles.rowCaption}>
                        {resource.type}
                        {resource.change && resource.change !== 'unchanged' && ` · ${changeLabels[resource.change]}`}
                      </Text>
                    </Text>
                    <Icon icon={ChevronRight} className="size-4 text-muted-foreground" />
                  </Text>
                </DetailRow>
              ))}
            </Box>
          </DetailSection>
        )}
        {relations.map(({ kind, title, edges }) => (
          <DetailSection key={kind} value={kind} title={title}>
            <ConnectionGroups kind={kind} edges={edges} byId={byId} icons={icons}>
              {renderRows}
            </ConnectionGroups>
          </DetailSection>
        ))}
      </DetailSections>
    </>
  )
}

export function EdgeDetails(props: EdgeDetailsProps) {
  const { byId, icons } = props
  const { rows, sections, toEntry, defaultSections } = describeEdges(props)
  const renderEntries = (edges: GraphEdge[], shared?: Endpoint) => (
    <ConnectionEntries edges={edges} byId={byId} icons={icons} shared={shared} toEntry={toEntry} />
  )
  return (
    <>
      <Metadata rows={rows} />
      <DetailSections type="multiple" defaultValue={defaultSections}>
        {sections.map(({ kind, title, note, edges }) => (
          <DetailSection key={kind} value={kind} title={title}>
            <Text as="p" className={styles.note}>
              {note}
            </Text>
            <ConnectionGroups kind={kind} edges={edges} byId={byId} icons={icons} groupDependencies={props.edges.length > 1}>
              {renderEntries}
            </ConnectionGroups>
          </DetailSection>
        ))}
      </DetailSections>
    </>
  )
}

function DetailRow({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <Button variant="outline" onClick={onClick} className={`inspector-row ${styles.row}`}>
      {children}
    </Button>
  )
}

type ConnectionGroupsProps = {
  kind: EdgeKind
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  groupDependencies?: boolean
  children: (edges: GraphEdge[], shared?: Endpoint) => ReactNode
}

function ConnectionGroups({ kind, groupDependencies = true, ...props }: ConnectionGroupsProps) {
  if (kind === 'depends_on' && groupDependencies) return <DependencyGroups {...props} />
  if (kind === 'triggers' || kind === 'connects_to') return <RelationGroups {...props} />
  return props.children(props.edges)
}

function DependencyGroups({ edges, byId, icons, children }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  children: (edges: GraphEdge[]) => ReactNode
}) {
  const groups = groupDependenciesByService(edges, byId)
  return (
    <DetailSections type="multiple">
      {groups.map(({ key, from, to, edges }) => (
        <DetailSection key={key} value={key} title={
          <Text className={styles.dependencyTitle}>
            <ServiceIcon icon={inspectorServiceIconSrc(from, icons)} />{from.name}
            <Icon icon={ArrowRight} className="size-4 text-muted-foreground" />
            <Text className="sr-only"> to </Text>
            <ServiceIcon icon={inspectorServiceIconSrc(to, icons)} />{to.name} ({edges.length})
          </Text>
        }>
          {children(edges)}
        </DetailSection>
      ))}
    </DetailSections>
  )
}

function RelationGroups({ edges, byId, icons, children }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  children: (edges: GraphEdge[], shared?: Endpoint) => ReactNode
}) {
  const { shared, singles } = groupBySharedEndpoint(edges)
  if (!shared.length) return children(singles)

  return (
    <Box className="space-y-2">
      <DetailSections type="multiple">
        {shared.map(({ key, endpoint, id, edges }) => {
          const resource = byId.get(id)!
          return (
            <DetailSection key={key} value={key} title={
              <Text className={styles.relationEndpoint}>
                <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(resource), icons)} />
                <Text className="min-w-0">
                  <Text className={styles.rowName}><ResourceName name={resource.name} /></Text>
                  <Text className={styles.rowCaption}>
                    {endpoint === 'from' ? 'Source' : 'Target'} · {countLabel(edges.length, 'connection')}
                  </Text>
                </Text>
              </Text>
            }>
              {children(edges, endpoint)}
            </DetailSection>
          )
        })}
      </DetailSections>
      {singles.length > 0 && children(singles)}
    </Box>
  )
}

function RelationRows({ edges, byId, icons, shared, toRow }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  shared?: Endpoint
  toRow: ReturnType<typeof describeResource>['toRow']
}) {
  return (
    <Box className={styles.rows}>
      {edges.map((edge) => {
        const { descriptions, summary, onClick } = toRow(edge)
        return (
          <DetailRow key={JSON.stringify([edge.from, edge.to, edge.state])} onClick={onClick}>
            <RelationEndpoints edge={edge} byId={byId} icons={icons} shared={shared} />
            <Text className={styles.relationCaption}>
              {descriptions && `${descriptions} · `}{summary}
            </Text>
          </DetailRow>
        )
      })}
    </Box>
  )
}

function RelationEndpoints({ edge, byId, icons, shared }: {
  edge: GraphEdge
  byId: ResourcesById
  icons: ServiceIcons
  shared?: Endpoint
}) {
  const endpoint = (side: Endpoint) => {
    const resource = byId.get(edge[side])!
    return (
      <Text className={styles.relationEndpoint}>
        <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(resource), icons)} />
        <Text className={styles.rowName}><ResourceName name={resource.name} /></Text>
      </Text>
    )
  }

  if (shared) return endpoint(shared === 'from' ? 'to' : 'from')

  return (
    <>
      {endpoint('from')}
      <Icon icon={ArrowDown} className="my-0.5 ml-0.5 block size-3 text-muted-foreground" />
      <Text className="sr-only"> to </Text>
      {endpoint('to')}
    </>
  )
}

function ConnectionEntries({ edges, byId, icons, shared, toEntry }: {
  edges: GraphEdge[]
  byId: ResourcesById
  icons: ServiceIcons
  shared?: Endpoint
  toEntry: ReturnType<typeof describeEdges>['toEntry']
}) {
  return (
    <Box className={styles.connections}>
      {edges.map((edge) => {
        const { endpoints, topology, evidence } = toEntry(edge)
        return (
          <Box key={JSON.stringify([edge.from, edge.to, edge.state])} className={styles.connection}>
            {endpoints.length > 0 && (
              <>
                <Text as="h3" className={styles.connectionTitle}>
                  <RelationEndpoints edge={edge} byId={byId} icons={icons} shared={shared} />
                </Text>
                <Metadata rows={endpoints} />
              </>
            )}
            {topology && <Text as="p" className={styles.note}>{topology}</Text>}
            <Evidence groups={evidence} />
          </Box>
        )
      })}
    </Box>
  )
}

function Evidence({ groups }: { groups: EvidenceGroup[] }) {
  return groups.map(({ key, label, details, entries }) => (
      <Box key={key} className={styles.evidenceGroup}>
        {label && (
          <Text as="h4" className={styles.evidenceTitle}>
            {label}
          </Text>
        )}
        {details && (
          <Text as="p" className={styles.evidenceDetails}>
            {details}
          </Text>
        )}
        <List className={styles.evidenceList}>
          {entries.map(({ source, resource, property }, index) => (
            <ListItem key={index} className={styles.evidenceEntry}>
              {source}
              {resource && <Box>Configured by: {resource}</Box>}
              <Text as="code" className={styles.evidenceProperty}>
                {property}
              </Text>
            </ListItem>
          ))}
        </List>
      </Box>
    ))
}

function ResourceName({ name }: { name: string }) {
  return (
    <>
      {name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  )
}
