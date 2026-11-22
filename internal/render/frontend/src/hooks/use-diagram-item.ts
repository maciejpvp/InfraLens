import type { DiagramItemData } from '../components/diagram.types'

import { diagramStyles as styles } from '../components/diagram.variants'
import { activationProps } from '../lib/activation-props'
import { changeSummary, countLabel } from '../lib/graph-view'
import { changeLabels } from '../lib/graph-view.config'
import { GROUP_HEADER_HEIGHT } from '../lib/layout.config'
import { serviceFor } from '../lib/graph-projection.ts'
import { cn } from '../lib/utils'

export const useDiagramItem = ({
  item,
  depth,
  byId,
  icons,
  selected,
  muted,
  onItem,
  toggle,
}: DiagramItemData) => {
  const service = item.service || (item.node && serviceFor(item.node.type))
  const icon = service?.icon && Object.hasOwn(icons, service.icon) ? icons[service.icon] : undefined
  const change = item.node?.change
  const count = countLabel(item.members.size, 'resource')
  const type = item.service ? 'SERVICE' : item.group ? 'GROUP' : item.node.type.split(':').at(-1)
  const showChange = !item.group && change && change !== 'unchanged'
  const open = activationProps<HTMLButtonElement>(() => onItem(item.id))

  return {
    buttonProps: {
      'data-item': item.id,
      'data-group': item.group ? item.id : undefined,
      'data-service': item.service?.id,
      'data-node': item.group ? undefined : item.id,
      'data-change': change ?? '',
      'aria-label': `${item.name}, ${item.group ? count : item.node.type}`,
      'aria-haspopup': 'dialog' as const,
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
              showChange && styles.changedCard[change],
              item.support && styles.supportCard,
              selected && styles.selectedCard,
            ],
        selected && styles.selected,
        muted && styles.mutedItem,
      ),
      style: item.expanded ? { height: GROUP_HEADER_HEIGHT } : undefined,
      ...open,
    },
    groupClassName: cn(styles.groupBounds, depth > 0 && styles.nestedGroupBounds),
    cardTopClassName: cn(styles.cardTop, item.group && styles.reserveToggle),
    count,
    showHeaderIcon: Boolean(service),
    type: !item.group && service?.icon ? `${service.name} · ${type}` : type,
    accent: { backgroundColor: service?.color || '#8ba6be' },
    meta: item.group ? `${count} · ${changeSummary(item, byId)}` : item.stack,
    changeBadge: showChange
      ? { text: changeLabels[change], className: cn(styles.change, styles.changeColor[change]) }
      : null,
    toggleProps: item.group
      ? {
          id: item.id,
          expanded: item.expanded,
          ariaLabel: `${item.expanded ? 'Collapse' : 'Expand'} ${item.name}`,
          symbol: item.expanded ? '−' : '+',
          events: activationProps<HTMLButtonElement>(() => toggle(item.id)),
        }
      : null,
    icon,
  }
}
