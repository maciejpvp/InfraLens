import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { Text } from '../ui/text'
import type { OpenRelation, OpenResource } from '../lib/inspector.types'
import type { ServiceIcons } from '../lib/graph.types'

import { ArrowLeft, GripHorizontal, X } from 'lucide-react'
import { useDetailsDialog } from '../hooks/use-details-dialog'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { DialogClose } from '../ui/dialog-close'
import { FloatingWindow } from '../ui/floating-window'
import { DialogTitle } from '../ui/dialog-title'
import { EdgeDetails } from './edge-details'
import { ResourceDetails } from './resource-details'
import { inspectorStyles as styles } from './inspector.variants'

export const DetailsDialog = ({
  inspector,
  byId,
  icons,
  onResource,
  onEdges,
}: {
  inspector: Parameters<typeof useDetailsDialog>[0]
  byId: Parameters<typeof useDetailsDialog>[1]
  icons: ServiceIcons
  onResource: OpenResource
  onEdges: OpenRelation
}) => {
  const {
    pages,
    page,
    body,
    closeButton,
    back,
    restoreGraphFocus,
    title,
    canGoBack,
    open,
    label,
    changeOpen,
    focusCloseButton,
    keepWindowOpen,
    windowRef,
    moveWithKeys,
    dragEvents,
  } = useDetailsDialog(inspector, byId)

  return (
    <Dialog modal={false} open={open} onOpenChange={changeOpen}>
      <FloatingWindow
        id="inspector"
        ref={windowRef}
        aria-describedby={undefined}
        className={styles.dialog}
        onOpenAutoFocus={focusCloseButton}
        onCloseAutoFocus={restoreGraphFocus}
        onInteractOutside={keepWindowOpen}
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
            {canGoBack && (
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
              {label}
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
          <DialogTitle className={styles.title}>{title}</DialogTitle>
        </Box>
        <Box id="details" ref={body} className={styles.body}>
          {pages.map((entry, index) => (
            <Box key={index} data-inspector-page hidden={entry !== page}>
              {entry.item ? (
                <ResourceDetails
                  item={entry.item}
                  links={entry.links}
                  byId={byId}
                  icons={icons}
                  onResource={onResource}
                  onEdges={onEdges}
                />
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
