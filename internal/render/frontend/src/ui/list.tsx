import type { ComponentPropsWithRef } from 'react'
import { createElement } from 'react'

type ListTag = 'ul' | 'dl'

export const List = <Tag extends ListTag = 'ul'>({
  as,
  ...props
}: { as?: Tag } & ComponentPropsWithRef<Tag>) => createElement(as ?? 'ul', props)
