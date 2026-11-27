import { AnimatePresence } from 'motion/react'
import { ArrowLeft, X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import { Dock } from '../../components/dock'
import { MotionContent } from '../../components/motion-content'
import { ResizeHandle } from '../../components/resize-handle'
import { ServiceIcon } from '../../components/service-icon'
import { serviceFor } from '../../lib/graph-projection'
import type { ResourcesById, ServiceIcons } from '../../lib/graph.types'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Dialog } from '../../ui/dialog'
import { DialogClose } from '../../ui/dialog-close'
import { DialogTitle } from '../../ui/dialog-title'
import { Icon } from '../../ui/icon'
import { Text } from '../../ui/text'
import { inspectorServiceIconSrc } from './describe-details'
import { EdgeDetails, ResourceDetails } from './details'
import type { InspectorPage, OpenRelation, OpenResource, useInspector } from './use-inspector'

const styles = {
  dialog: 'report-inspector flex min-h-0 shrink-0 flex-col border-l bg-card outline-none',
  chrome: 'flex min-h-9 shrink-0 items-center gap-1 border-b px-3',
  label: 'min-w-0 flex-1 text-xs font-semibold text-muted-foreground',
  body: 'relative min-h-0 overflow-auto overscroll-contain px-3 pb-3 text-sm wrap-anywhere',
  identity: 'space-y-1 border-b py-3',
  titleRow: 'flex items-start gap-2 [&_.service-icon]:size-5',
  title: 'min-w-0 text-base leading-snug font-semibold wrap-anywhere',
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
  if (!page?.item) return 'Connection inspector'
  return page.item.group ? 'Resource group' : 'Resource inspector'
}

export function DetailsDialog({
  inspector,
  byId,
  icons,
  onResource,
  onEdges,
  resourceWorkflows,
  compact,
  suspended,
}: {
  inspector: ReturnType<typeof useInspector>
  byId: ResourcesById
  icons: ServiceIcons
  onResource: OpenResource
  onEdges: OpenRelation
  resourceWorkflows?: ResourceWorkflowLinks
  compact: boolean
  suspended: boolean
}) {
  const { pages, body, closeButton, back, close, restoreGraphFocus } = inspector
  const page = pages.at(-1)

  return (
    <AnimatePresence>
      {page && <Dock kind="inspector">
        {(present, resizable) => (
          <Dialog modal={compact && !suspended} open={present} onOpenChange={(open) => { if (!open) close() }}>
            <RadixDialog.Content
              forceMount
              id="inspector"
              aria-describedby={undefined}
              className={styles.dialog}
              onOpenAutoFocus={(event) => {
                event.preventDefault()
                closeButton.current?.focus()
              }}
              onCloseAutoFocus={restoreGraphFocus}
              onEscapeKeyDown={(event) => {
                if (!present || suspended || (event.target instanceof Element && event.target.closest('#report-cost-window')))
                  event.preventDefault()
              }}
              onInteractOutside={(event) => { if (!present || !compact) event.preventDefault() }}
            >
              {!compact && resizable && <ResizeHandle panelId="inspector" axis="width" label="Resize inspector" />}
              <Box as="header" className={styles.chrome}>
                {pages.length > 1 && (
                  <Button id="inspector-back" variant="ghost" size="icon-xs" aria-label="Back to previous details"
                    title="Back to previous details" onClick={back}>
                    <Icon icon={ArrowLeft} />
                  </Button>
                )}
                <Text id="inspector-label" className={styles.label}>{getPageLabel(page)}</Text>
                <DialogClose asChild>
                  <Button id="clear-selection" ref={closeButton} variant="ghost" size="icon-xs" aria-label="Close details" title="Close details">
                    <Icon icon={X} />
                  </Button>
                </DialogClose>
              </Box>
              <Box id="details" ref={body} className={styles.body}>
                <Box className={styles.identity}>
                  <Box className={styles.titleRow}>
                    {page?.item?.node && <ServiceIcon icon={inspectorServiceIconSrc(serviceFor(page.item.node), icons)} />}
                    <DialogTitle className={styles.title}>{getPageTitle(page, byId)}</DialogTitle>
                  </Box>
                  {page?.item?.node && <Text as="p" className="text-xs text-muted-foreground">{page.item.node.type}</Text>}
                </Box>
                <AnimatePresence initial={false} mode="popLayout">
                  {pages.map((entry, index) => (
                    <MotionContent key={JSON.stringify([index, entry.item?.id, entry.edges.map(({ from, to, kind, state }) => [from, to, kind, state])])}
                      data-inspector-page hidden={entry !== page}>
                      {entry.item ? (
                        <>
                          <ResourceDetails
                            item={entry.item}
                            links={entry.links}
                            byId={byId}
                            icons={icons}
                            onResource={onResource}
                            onEdges={onEdges}
                          />
                          {entry.item.node && resourceWorkflows && <ResourceWorkflows {...resourceWorkflows} id={entry.item.node.id} />}
                        </>
                      ) : (
                        <EdgeDetails edges={entry.edges} byId={byId} icons={icons} />
                      )}
                    </MotionContent>
                  ))}
                </AnimatePresence>
              </Box>
            </RadixDialog.Content>
          </Dialog>
        )}
      </Dock>}
    </AnimatePresence>
  )
}

function ResourceWorkflows({ forResource, onSelect, id }: ResourceWorkflowLinks & { id: string }) {
  const workflows = forResource(id)
  if (!workflows.length) return null

  return (
    <section aria-label="Resource cost workflows" className="mt-3 space-y-1 border-t pt-2">
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
