import type { ResourcesById } from '../lib/graph.types'
import type { useInspector } from './use-inspector'

import { connectionTitle } from '../lib/graph-view'
import { useFloatingWindow } from './use-floating-window'

export const useDetailsDialog = (inspector: ReturnType<typeof useInspector>, byId: ResourcesById) => {
  const { pages, body, closeButton, back, close, restoreGraphFocus } = inspector
  const page = pages.at(-1)
  const open = Boolean(page)
  const floatingWindow = useFloatingWindow(open)
  const title =
    page?.item?.name ??
    (page?.edges?.length === 1
      ? connectionTitle(page.edges[0], byId)
      : page && `Connections at this point (${page.edges.length})`)

  const focusCloseButton = (event: Event) => {
    event.preventDefault()
    closeButton.current?.focus()
  }
  const keepWindowOpen = (event: Event) => event.preventDefault()
  const changeOpen = (open: boolean) => {
    if (!open) close()
  }

  return {
    pages,
    page,
    body,
    closeButton,
    back,
    restoreGraphFocus,
    title,
    canGoBack: pages.length > 1,
    open,
    label: page?.item ? (page.item.group ? 'Resource group' : 'Resource') : 'Connection details',
    changeOpen,
    focusCloseButton,
    keepWindowOpen,
    ...floatingWindow,
  }
}
