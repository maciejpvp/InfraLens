import type { ComponentPropsWithRef } from 'react'

export const Image = (props: ComponentPropsWithRef<'img'> & { alt: string }) => <img {...props} />
