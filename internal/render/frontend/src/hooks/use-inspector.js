import { useLayoutEffect, useRef, useState } from 'react'

export function useInspector(resolveOpener) {
  const [pages, setPages] = useState([])
  const body = useRef(null)
  const closeButton = useRef(null)
  const opener = useRef(null)
  const restore = useRef(null)

  function open(page, origin) {
    opener.current = origin
    setPages([page])
  }

  function navigate(page, trigger) {
    const scroll = body.current.scrollTop
    setPages(previous => [
      ...previous.slice(0, -1),
      { ...previous.at(-1), trigger, scroll },
      page,
    ])
  }

  function back() {
    restore.current = pages.at(-2)
    setPages(pages.slice(0, -1))
  }

  function close() {
    restore.current = null
    setPages([])
  }

  function restoreGraphFocus(event) {
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
