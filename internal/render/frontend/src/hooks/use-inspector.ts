import type { InspectorOrigin, InspectorPage } from '../lib/inspector.types'

import { useLayoutEffect, useRef, useState } from 'react'

export const useInspector = (
  resolveOpener: (origin: InspectorOrigin | null) => HTMLElement | SVGGElement | undefined | null,
) => {
  const [pages, setPages] = useState<InspectorPage[]>([])
  const body = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const opener = useRef<InspectorOrigin | null>(null)
  const restore = useRef<InspectorPage | null>(null)

  const open = (page: InspectorPage, origin: InspectorOrigin) => {
    opener.current = origin
    setPages([page])
  }

  const navigate = (page: InspectorPage, trigger: HTMLButtonElement) => {
    const scroll = body.current?.scrollTop ?? 0
    setPages((previous) => {
      const current = previous.at(-1)
      return current ? [...previous.slice(0, -1), { ...current, trigger, scroll }, page] : [page]
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
    if (!pages.length || !body.current) return
    const previous = restore.current
    restore.current = null
    const target = previous?.trigger || closeButton.current
    target?.focus({ preventScroll: true })
    body.current.scrollTop = previous?.scroll || 0
  }, [pages])

  return { pages, body, closeButton, open, navigate, back, close, restoreGraphFocus }
}
