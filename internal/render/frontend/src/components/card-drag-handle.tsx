import type { KeyboardEvent, PointerEvent } from 'react'
import type { DiagramItemData } from './diagram.types'
import type { Point } from '../lib/graph.types'

import { GripHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Icon } from '../ui/icon'

type Props = NonNullable<DiagramItemData['drag']> & { id: string; name: string }
const direction: Record<string, Point> = {
  ArrowLeft: { x: -12, y: 0 }, ArrowRight: { x: 12, y: 0 },
  ArrowUp: { x: 0, y: -12 }, ArrowDown: { x: 0, y: 12 },
}

export const CardDragHandle = ({ id, name, camera, moveCard }: Props) => {
  const pointer = useRef<{ id: number; origin: Point; box?: Point } | null>(null)
  const keyboard = useRef<Point | undefined>(undefined)
  const [pickedUp, setPickedUp] = useState(false)
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || keyboard.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = { id: event.pointerId, origin: { x: event.clientX, y: event.clientY } }
  }
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = pointer.current
    const flow = camera.flow.current
    if (!drag || drag.id !== event.pointerId || !flow) return
    const position = { x: event.clientX, y: event.clientY }
    if (!drag.box && Math.hypot(position.x - drag.origin.x, position.y - drag.origin.y) < 4) return
    drag.box ??= moveCard.begin(id)
    if (!drag.box) return
    const from = flow.screenToFlowPosition(drag.origin)
    const to = flow.screenToFlowPosition(position)
    moveCard.move(id, { x: drag.box.x + to.x - from.x, y: drag.box.y + to.y - from.y })
  }
  const pointerEnd = (event: PointerEvent<HTMLButtonElement>, accept: boolean) => {
    if (pointer.current?.id !== event.pointerId) return
    if (accept && pointer.current.box) pointerMove(event)
    pointer.current = null
    moveCard.end(id, accept)
  }
  const cancelKeyboard = () => {
    if (!keyboard.current) return
    keyboard.current = undefined
    setPickedUp(false)
    moveCard.end(id, false)
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = direction[event.key]
    if (!step && ![' ', 'Enter', 'Escape'].includes(event.key)) return
    if (!keyboard.current && (step || event.key === 'Escape')) return
    event.preventDefault()
    event.stopPropagation()
    if (step && keyboard.current) {
      keyboard.current = { x: keyboard.current.x + step.x, y: keyboard.current.y + step.y }
      moveCard.move(id, keyboard.current)
    } else if (keyboard.current) {
      keyboard.current = undefined
      setPickedUp(false)
      moveCard.end(id, event.key !== 'Escape')
    } else {
      keyboard.current = moveCard.begin(id)
      setPickedUp(Boolean(keyboard.current))
    }
  }
  return (
    <Button
      unstyled
      type="button"
      data-drag-handle={id}
      aria-label={`Move ${name}. Press Enter to pick up or drop, arrow keys to move, Escape to cancel.`}
      aria-pressed={pickedUp}
      className="nopan pointer-events-auto absolute right-0 bottom-0 grid size-11 touch-none place-items-center rounded-br-[17px] text-muted-foreground opacity-65 hover:opacity-100 focus-visible:bg-accent focus-visible:opacity-100 cursor-grab active:cursor-grabbing"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={(event) => pointerEnd(event, true)}
      onPointerCancel={(event) => pointerEnd(event, false)}
      onLostPointerCapture={(event) => pointerEnd(event, false)}
      onKeyDown={keyDown}
      onBlur={cancelKeyboard}
    >
      <Icon icon={GripHorizontal} />
    </Button>
  )
}
