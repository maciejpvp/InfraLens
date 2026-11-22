export const connectionLegendStyles = {
  placement:
    'right-2.5 bottom-[max(3.75rem,calc(env(safe-area-inset-bottom)+3.25rem))] w-max max-w-[calc(100%-1.25rem)] p-1.5 sm:right-4',
  header: 'flex items-center gap-1',
  button: 'justify-start gap-2 rounded-full px-2.5 text-xs motion-safe:active:scale-95',
  motion: 'ml-auto rounded-full text-muted-foreground motion-reduce:hidden',
  content: 'px-2.5 pt-1 pb-1.5 motion-safe:animate-detail-in',
  entries: 'grid gap-1',
  entry: 'flex items-center gap-2 text-xs leading-tight text-foreground',
  sample: 'pointer-events-none h-3.5 w-12 shrink-0',
  note: 'mt-2 text-[.625rem] leading-snug text-muted-foreground',
}
