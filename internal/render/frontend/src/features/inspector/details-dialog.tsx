import { ArrowLeft, GripHorizontal, X } from 'lucide-react'
import { FloatingWindow } from '../../components/floating-window'
import { useFloatingWindow } from '../../hooks/use-floating-window'
import type { ResourcesById, ServiceIcons } from '../../lib/graph.types'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { DialogClose } from '../../ui/dialog-close'
import { DialogTitle } from '../../ui/dialog-title'
import { Icon } from '../../ui/icon'
import { Text } from '../../ui/text'
import { EdgeDetails, ResourceDetails } from './details'
import type { InspectorPage, OpenRelation, OpenResource, useInspector } from './use-inspector'

const styles = {
  dialog:
    'right-3 bottom-[max(3.75rem,calc(env(safe-area-inset-bottom)+3.25rem))] flex min-h-0 w-[min(23rem,calc(100vw-1.5rem))] max-w-[var(--inspector-max-width,100vw)] max-h-[min(61dvh,34rem,var(--inspector-max-height,100dvh))] flex-col overflow-hidden rounded-[1.65rem] border border-white/15 bg-card shadow-window sm:top-24 sm:right-5 sm:bottom-auto sm:max-h-[min(69dvh,37rem,var(--inspector-max-height,100dvh))] motion-safe:animate-window-in contrast-more:border-foreground',
  header:
    'shrink-0 cursor-grab touch-none select-none bg-linear-to-b from-white/[.075] to-transparent px-3.5 pt-3 pb-2 active:cursor-grabbing',
  chrome: 'flex items-center gap-1.5',
  chromeButton:
    'shrink-0 rounded-full border border-white/10 bg-white/5 motion-safe:active:scale-95',
  grip: 'shrink-0 cursor-grab rounded-full text-muted-foreground active:cursor-grabbing motion-safe:active:scale-95',
  label: 'min-w-0 flex-1 pl-1 text-xs font-semibold tracking-wide text-muted-foreground',
  body: 'min-h-0 overflow-auto overscroll-contain px-3.5 pt-1 pb-3.5 text-sm leading-relaxed wrap-anywhere',
  title: 'mt-2 line-clamp-2 text-[1.125rem] leading-tight font-semibold tracking-tight wrap-anywhere',
}

type ResourceWorkflowLinks = {
  forResource: (id: string) => readonly { id: string; label: string }[]
  onSelect: (id: string) => void
}

function getPageTitle(page: InspectorPage | undefined, byId: ResourcesById) {
  if (!page) return
  if (page.item) return page.item.name
  if (page.edges.length !== 1) return `Connections at this point (${page.edges.length})`
  const [{ from, to }] = page.edges
  return `${byId.get(from)!.name} → ${byId.get(to)!.name}`
}

function getPageLabel(page: InspectorPage | undefined) {
  if (!page?.item) return 'Connection details'
  return page.item.group ? 'Resource group' : 'Resource'
}

export function DetailsDialog({
  inspector,
  byId,
  icons,
  onResource,
  onEdges,
  resourceWorkflows,
}: {
  inspector: ReturnType<typeof useInspector>
  byId: ResourcesById
  icons: ServiceIcons
  onResource: OpenResource
  onEdges: OpenRelation
  resourceWorkflows?: ResourceWorkflowLinks
}) {
  const { pages, body, closeButton, back, close, restoreGraphFocus } = inspector
  const page = pages.at(-1)
  const { windowRef, moveWithKeys, dragEvents } = useFloatingWindow(Boolean(page))

  const focusCloseButton = (event: Event) => {
    event.preventDefault()
    closeButton.current?.focus()
  }

  return (
    <Dialog modal={false} open={Boolean(page)} onOpenChange={(open) => { if (!open) close() }}>
      <FloatingWindow
        id="inspector"
        ref={windowRef}
        aria-describedby={undefined}
        className={styles.dialog}
        onOpenAutoFocus={focusCloseButton}
        onCloseAutoFocus={restoreGraphFocus}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <Box as="header" className={styles.header} {...dragEvents}>
          <Box className={styles.chrome}>
            <DialogClose asChild>
              <Button
                id="clear-selection"
                ref={closeButton}
                variant="ghost"
                size="icon-sm"
                className={styles.chromeButton}
                aria-label="Close details"
              >
                <Icon icon={X} />
              </Button>
            </DialogClose>
            {pages.length > 1 && (
              <Button
                id="inspector-back"
                variant="ghost"
                size="icon-sm"
                className={styles.chromeButton}
                aria-label="Back to previous details"
                onClick={back}
              >
                <Icon icon={ArrowLeft} />
              </Button>
            )}
            <Text id="inspector-label" className={styles.label}>
              {getPageLabel(page)}
            </Text>
            <Button
              data-window-grip
              variant="ghost"
              size="icon-sm"
              className={styles.grip}
              aria-label="Move details window with arrow keys. Home resets position."
              title="Drag to move"
              onKeyDown={moveWithKeys}
            >
              <Icon icon={GripHorizontal} />
            </Button>
          </Box>
          <DialogTitle className={styles.title}>{getPageTitle(page, byId)}</DialogTitle>
        </Box>
        <Box id="details" ref={body} className={styles.body}>
          {pages.map((entry, index) => (
            <Box key={index} data-inspector-page hidden={entry !== page}>
              {entry.item ? (
                <>
                  {entry.item.node && resourceWorkflows && <ResourceWorkflows {...resourceWorkflows} id={entry.item.node.id} />}
                  <ResourceDetails
                    item={entry.item}
                    links={entry.links}
                    byId={byId}
                    icons={icons}
                    onResource={onResource}
                    onEdges={onEdges}
                  />
                </>
              ) : (
                <EdgeDetails edges={entry.edges} byId={byId} icons={icons} />
              )}
            </Box>
          ))}
        </Box>
      </FloatingWindow>
    </Dialog>
  )
}

function ResourceWorkflows({ forResource, onSelect, id }: ResourceWorkflowLinks & { id: string }) {
  const workflows = forResource(id)
  if (!workflows.length) return null

  return (
    <section aria-label="Resource cost workflows" className="mb-3 space-y-1">
      <h3 className="font-medium">Cost workflows</h3>
      {workflows.map((entry) => (
        <Button key={entry.id} type="button" size="sm" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left"
          onClick={() => onSelect(entry.id)}>
          {entry.label}
        </Button>
      ))}
    </section>
  )
}
