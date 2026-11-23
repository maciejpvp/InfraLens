import type { DiagramItemData } from '../components/diagram.types'

import { diagramStyles as styles } from '../components/diagram.variants'
import { activationProps } from '../lib/activation-props'
import { changeSummary, countLabel, serviceIconSrc } from '../lib/graph-view'
import { changeLabels } from '../lib/graph-view.config'
import { GROUP_HEADER_HEIGHT } from '../lib/layout.config'
import { serviceFor } from '../lib/graph-projection.ts'
import { cn } from '../lib/utils'

const changePriority = ['delete', 'replace', 'update', 'create'] as const

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
  const service = item.service || (item.node && serviceFor(item.node))
  const icon = serviceIconSrc(service, icons)
  const change = item.group
    ? changePriority.find((status) => {
        for (const id of item.members) if (byId.get(id)?.change === status) return true
        return false
      })
    : item.node.change
  const hasChange = change && change !== 'unchanged'
  const count = countLabel(item.members.size, 'resource')
  const type = item.service ? 'SERVICE' : item.group ? 'GROUP' : item.node.type.split(':').at(-1)
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
              hasChange ? [styles.changedCard, styles.changeColor[change]] : styles.cardShadow,
              item.support && styles.supportCard,
              selected && styles.selectedCard,
            ],
        selected && styles.selected,
        muted && styles.mutedItem,
      ),
      style: item.expanded ? { height: GROUP_HEADER_HEIGHT } : undefined,
      ...open,
    },
    groupClassName: cn(styles.groupBounds, depth > 0 && styles.nestedGroupBounds, muted && styles.mutedItem),
    cardTopClassName: cn(styles.cardTop, item.group && styles.reserveToggle),
    count,
    showHeaderIcon: Boolean(service),
    type: !item.group && service?.icon ? `${service.name} · ${type}` : type,
    accent: { backgroundColor: service?.color || '#8ba6be' },
    meta: item.group ? `${count} · ${changeSummary(item, byId)}` : item.stack,
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
