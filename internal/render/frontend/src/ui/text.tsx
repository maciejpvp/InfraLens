import type { ComponentPropsWithRef } from 'react'
import { createElement } from 'react'

type TextTag = 'span' | 'p' | 'h2' | 'h3' | 'h4' | 'dt' | 'dd' | 'code' | 'output'

export const Text = <Tag extends TextTag = 'span'>({
  as,
  ...props
}: { as?: Tag } & ComponentPropsWithRef<Tag>) => createElement(as ?? 'span', props)
