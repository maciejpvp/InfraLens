import type { InspectorOrigin, InspectorPage } from '../lib/inspector.types'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export const useInspector = (
  resolveOpener: (origin: InspectorOrigin | null) => HTMLElement | SVGGElement | undefined | null,
) => {
  const [pages, setPages] = useState<InspectorPage[]>([])
  const body = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<InspectorOrigin | null>(null)
  const restore = useRef<InspectorPage | null>(null)

  const open = useCallback((page: InspectorPage, origin: InspectorOrigin) => {
    opener.current = origin
    setPages([page])
  }, [])

  const navigate = (page: InspectorPage, trigger: HTMLButtonElement) => {
    const container = body.current
    const scroll = container?.scrollTop ?? 0
    const triggerOffset = container ? trigger.getBoundingClientRect().top - container.getBoundingClientRect().top : undefined
    setPages((previous) => {
      const current = previous.at(-1)
      return current ? [...previous.slice(0, -1), { ...current, trigger, triggerOffset, scroll }, page] : [page]
    })
  }

  const back = () => {
    restore.current = pages.at(-2) ?? null
    setPages(pages.slice(0, -1))
  }

  const close = () => {
    restore.current = null
    setPages([])
  }

  const restoreGraphFocus = (event: Event) => {
    event.preventDefault()
    resolveOpener(opener.current)?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    const container = body.current
    if (!pages.length || !container) return
    const previous = restore.current
    restore.current = null
    const target = previous?.trigger || closeButton.current
    target?.focus({ preventScroll: true })
    container.scrollTop = previous?.scroll || 0
    const { trigger, triggerOffset } = previous ?? {}
    if (!trigger || triggerOffset === undefined) return

    // Rows near the restored viewport can replace their estimated height after a page is shown again.
    const alignTrigger = () => {
      if (document.activeElement !== trigger) return
      const offset = trigger.getBoundingClientRect().top - container.getBoundingClientRect().top
      if (Math.abs(offset - triggerOffset) >= 1) container.scrollTop += offset - triggerOffset
    }
    alignTrigger()
    const frame = requestAnimationFrame(alignTrigger)
    return () => cancelAnimationFrame(frame)
  }, [pages])

  return { pages, body, closeButton, open, navigate, back, close, restoreGraphFocus }
}
