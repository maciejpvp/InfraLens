import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { Text } from '../ui/text'
import type { OpenRelation, OpenResource } from '../lib/inspector.types'

import { ArrowLeft, X } from 'lucide-react'
import { useDetailsDialog } from '../hooks/use-details-dialog'
import { Button } from '../ui/button'
import { Dialog } from '../ui/dialog'
import { DialogClose } from '../ui/dialog-close'
import { DialogContent } from '../ui/dialog-content'
import { DialogTitle } from '../ui/dialog-title'
import { EdgeDetails } from './edge-details'
import { ResourceDetails } from './resource-details'
import { inspectorStyles as styles } from './inspector.variants'

export const DetailsDialog = ({
  inspector,
  byId,
  onResource,
  onEdges,
}: {
  inspector: Parameters<typeof useDetailsDialog>[0]
  byId: Parameters<typeof useDetailsDialog>[1]
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
    preventPointerDismiss,
    overlayProps,
  } = useDetailsDialog(inspector, byId)

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        id="inspector"
        aria-describedby={undefined}
        className={styles.dialog}
        onOpenAutoFocus={focusCloseButton}
        onCloseAutoFocus={restoreGraphFocus}
        onPointerDownOutside={preventPointerDismiss}
        overlayProps={overlayProps}
      >
        <Box as="header" className={styles.header}>
          {canGoBack && (
            <Button
              id="inspector-back"
              variant="ghost"
              size="icon-lg"
              aria-label="Back to previous details"
              onClick={back}
            >
              <Icon icon={ArrowLeft} />
            </Button>
          )}
          <Text id="inspector-label" className={styles.label}>
            {label}
          </Text>
          <DialogClose asChild>
            <Button
              id="clear-selection"
              ref={closeButton}
              variant="ghost"
              size="icon-lg"
              aria-label="Close details"
            >
              <Icon icon={X} />
            </Button>
          </DialogClose>
        </Box>
        <Box id="details" ref={body} className={styles.body}>
          <DialogTitle className={styles.title}>{title}</DialogTitle>
          {pages.map((entry, index) => (
            <Box key={index} data-inspector-page hidden={entry !== page}>
              {entry.item ? (
                <ResourceDetails
                  item={entry.item}
                  links={entry.links}
                  byId={byId}
                  onResource={onResource}
                  onEdges={onEdges}
                />
              ) : (
                <EdgeDetails edges={entry.edges} byId={byId} />
              )}
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
