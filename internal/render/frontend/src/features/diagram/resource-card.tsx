import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { ServiceIcon } from '../../components/service-icon'
import { isAppSyncAPI, serviceFor } from '../../lib/graph-projection.ts'
import { changeLabels, countLabel, groupChanges, serviceIconSrc } from '../../lib/graph-view'
import { cn } from '../../lib/utils'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Text } from '../../ui/text'
import { activationProps } from './activation-props'
import { CardDragHandle } from './card-drag-handle'
import type { DiagramItemData, DiagramNode } from './diagram-elements'
import { GROUP_HEADER_HEIGHT } from './layout/dimensions'

const styles = {
  selected: 'selected',
  item: 'relative pointer-events-none',
  groupBounds: 'absolute inset-0 rounded-lg bg-card/90',
  nestedGroupBounds: 'border-dashed',
  button:
    'nopan pointer-events-auto absolute inset-x-0 top-0 w-full cursor-pointer overflow-hidden text-left outline-2 outline-transparent transition-[opacity,background-color,border-color,outline-color] duration-(--motion-feedback) ease-(--motion-standard)',
  groupHeader: 'group-header',
  header: 'header-bg flex items-center gap-2 rounded-t-lg px-3.5 hover:bg-accent/70 focus-visible:bg-accent',
  headerWithIcon: 'pl-2.5',
  selectedHeader: 'bg-accent',
  headerName: 'min-w-0 flex-1 truncate text-sm font-semibold',
  groupCount: 'shrink-0 pr-9 text-xs text-muted-foreground',
  node: 'node',
  mutedItem: 'muted opacity-60 focus-visible:opacity-100',
  card: 'body flex h-full flex-col justify-center gap-1 rounded-lg bg-muted px-3.5 hover:bg-accent/40 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  supportCard: 'border-dashed',
  selectedCard: 'outline-solid outline-2 outline-offset-1 outline-primary',
  statusBorder: 'border border-input',
  changedCard: 'border-(--card-change)',
  changeColor: {
    unchanged: '',
    create: '[--card-change:var(--card-create)]',
    delete: '[--card-change:var(--card-delete)]',
    update: '[--card-change:var(--card-update)]',
    replace: '[--card-change:var(--card-replace)]',
  },
  cardTop: 'flex items-center gap-2',
  reserveToggle: 'pr-9',
  accent: 'absolute top-4.5 left-0 h-7 w-[3px] rounded-r-sm',
  nodeType: 'node-type min-w-0 flex-1 truncate text-[11px] text-muted-foreground',
  nodeName: 'node-name truncate text-sm font-medium',
  nodeMeta: 'node-meta truncate text-xs text-muted-foreground',
  change: 'shrink-0 text-[11px] text-(--card-change)',
  handle: 'opacity-0',
  toggle:
    'nopan pointer-events-auto absolute top-1.5 right-2.5 size-[30px] cursor-pointer rounded-sm border border-transparent bg-transparent p-0 text-lg font-medium text-muted-foreground hover:bg-accent focus-visible:ring-ring motion-safe:active:scale-95',
}

const costPercent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

export function DiagramItem({ data }: NodeProps<DiagramNode>) {
  const { item, bounds, workflowHeat } = data
  const percent = workflowHeat && (workflowHeat.share < 0.001 ? '<0.1%' : costPercent.format(workflowHeat.share))
  const costLabel = workflowHeat && `${percent} of ${workflowHeat.partial ? 'known ' : ''}workflow cost`
  const heatColor = workflowHeat && `color-mix(in srgb, var(--color-cost-warning) ${5 + 26 * workflowHeat.intensity}%, transparent)`
  const name = <Text className={cn(styles.nodeName, data.drag && 'pr-8')}>{item.name}</Text>
  const usage = data.workflowUsage?.join(' · ')
  const usageClass = 'line-clamp-2 text-xs leading-tight text-muted-foreground'
  const {
    buttonProps,
    groupClassName,
    cardTopClassName,
    count,
    showHeaderIcon,
    type,
    accent,
    meta,
    changeBadge,
    toggleProps,
    icon,
  } = getCardPresentation(data)

  return (
    <Box className={styles.item} style={{ ...bounds, ...data.visual }} inert={data.retiring} data-diagram-card>
      {item.expanded && <Box className={groupClassName} />}
      <Button unstyled type="button" {...buttonProps}
        aria-label={costLabel ? `${buttonProps['aria-label']}, ${costLabel}` : buttonProps['aria-label']}
        style={heatColor ? { ...buttonProps.style, backgroundImage: `linear-gradient(${heatColor}, ${heatColor})` } : buttonProps.style}>
        {item.expanded ? (
          <>
            {showHeaderIcon && <ServiceIcon icon={icon} />}
            <Text className={styles.headerName}>{item.name}</Text>
            <Text className={styles.groupCount}>{count}</Text>
          </>
        ) : (
          <>
            <Text className={styles.accent} style={accent} />
            <Text className={cardTopClassName}>
              <ServiceIcon icon={icon} />
              <Text className={styles.nodeType}>{type}</Text>
              {changeBadge && <Text className={changeBadge.className}>{changeBadge.text}</Text>}
            </Text>
            {workflowHeat ? (
              <Text className="flex items-center gap-2">
                {name}
                <Text className="ml-auto shrink-0 text-xs text-cost-value tabular-nums" title={costLabel}>
                  {percent}{workflowHeat.partial ? ' known' : ''}
                </Text>
              </Text>
            ) : name}
            <Text className={cn(usage ? usageClass : styles.nodeMeta, data.drag && 'pr-8')} title={usage}>{usage ?? meta}</Text>
          </>
        )}
      </Button>
      {data.drag && <CardDragHandle {...data.drag} id={item.id} name={item.name} />}
      {toggleProps && <GroupToggle {...toggleProps} />}
      <Handle isConnectable={false} type="target" position={Position.Left} className={styles.handle} />
      <Handle isConnectable={false} type="source" position={Position.Right} className={styles.handle} />
    </Box>
  )
}

function GroupToggle({
  id,
  expanded,
  ariaLabel,
  symbol,
  events,
  className,
}: NonNullable<ReturnType<typeof getCardPresentation>['toggleProps']>) {
  return (
    <Button
      type="button"
      variant="outline"
      data-toggle={id}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      className={className}
      {...events}
    >
      {symbol}
    </Button>
  )
}

const getCardPresentation = ({
  item,
  depth,
  byId,
  icons,
  selected,
  muted,
  onItem,
  canIsolate,
  toggle,
  workflowUsage,
}: DiagramItemData) => {
  const service = item.service || (item.node && serviceFor(item.node))
  const icon = serviceIconSrc(service, icons)
  const groupStatus = item.group ? groupChanges(item.members, byId) : undefined
  const change = item.group ? groupStatus?.change : item.node.change
  const hasChange = change && change !== 'unchanged'
  const statusColor = styles.changeColor[change ?? 'unchanged']
  const resourceCount = countLabel(item.members.size, 'resource')
  const groupLabel = groupStatus ? `${resourceCount} · ${groupStatus.summary}` : undefined
  const connectionGroup = item.group && item.connectionGroup
  let type: string | undefined
  if (isAppSyncAPI(item.node)) type = 'AppSync · GraphQL API'
  else if (connectionGroup) type = 'CONNECTED SERVICES'
  else if (item.service) type = 'SERVICE'
  else if (item.group) type = 'GROUP'
  else type = item.node.type.split(':').at(-1)
  const open = activationProps<HTMLButtonElement>((event) => {
    const pointer = canIsolate && event.type === 'click' && event.detail > 0
    onItem(item.id, pointer ? 'pointer' : undefined)
  })

  return {
    buttonProps: {
      'data-item': item.id,
      'data-group': item.group ? item.id : undefined,
      'data-service': connectionGroup ? undefined : item.service?.id,
      'data-connection-group': connectionGroup ? '' : undefined,
      'data-node': item.group ? undefined : item.id,
      'data-change': (item.group && change === 'unchanged' ? undefined : change) ?? '',
      'aria-label': `${item.name}, ${item.group ? groupLabel : item.node.type}${workflowUsage?.length ? ', per run: ' + workflowUsage.join(', ') : ''}`,
      'aria-haspopup': 'dialog' as const,
      title: groupLabel ? `${item.name}\n${groupLabel}` : undefined,
      className: cn(
        styles.button,
        item.expanded
          ? [
              styles.groupHeader,
              styles.header,
              service && styles.headerWithIcon,
              selected && styles.selectedHeader,
            ]
          : [
              styles.node,
              styles.card,
              styles.statusBorder,
              statusColor,
              hasChange && styles.changedCard,
              item.support && styles.supportCard,
              selected && styles.selectedCard,
            ],
        selected && styles.selected,
        muted && !item.expanded && styles.mutedItem,
      ),
      style: item.expanded ? { height: GROUP_HEADER_HEIGHT } : undefined,
      ...open,
      onDoubleClick: canIsolate ? () => onItem(item.id, 'connections') : undefined,
    },
    groupClassName: cn(
      styles.groupBounds,
      styles.statusBorder,
      hasChange && styles.changedCard,
      statusColor,
      depth > 0 && styles.nestedGroupBounds,
    ),
    cardTopClassName: cn(styles.cardTop, item.group && styles.reserveToggle),
    count: item.service && hasChange ? `${resourceCount} · ${changeLabels[change]}` : resourceCount,
    showHeaderIcon: Boolean(service),
    type: !item.group && service?.icon ? `${service.name} · ${type}` : type,
    accent: { backgroundColor: service?.color || '#8ba6be' },
    meta: groupStatus ? `${resourceCount} · ${groupStatus.compactSummary}` : item.stack,
    changeBadge: !item.group && hasChange
      ? { text: changeLabels[change], className: styles.change }
      : null,
    toggleProps: item.group
      ? {
          id: item.id,
          className: cn(styles.toggle, muted && styles.mutedItem),
          expanded: item.expanded,
          ariaLabel: `${item.expanded ? 'Collapse' : 'Expand'} ${item.name}`,
          symbol: item.expanded ? '−' : '+',
          events: activationProps<HTMLButtonElement>(() => toggle(item.id)),
        }
      : null,
    icon,
  }
}
