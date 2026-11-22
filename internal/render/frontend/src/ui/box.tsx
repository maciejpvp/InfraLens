import type { ComponentPropsWithRef } from 'react'
import { createElement } from 'react'

type BoxTag = 'div' | 'main' | 'section' | 'header'

export const Box = <Tag extends BoxTag = 'div'>({
  as,
  ...props
}: { as?: Tag } & ComponentPropsWithRef<Tag>) => createElement(as ?? 'div', props)
