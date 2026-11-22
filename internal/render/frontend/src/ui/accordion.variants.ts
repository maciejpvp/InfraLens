export const accordionStyles = {
  item: 'border-b last:border-b-0',
  header: 'flex',
  trigger:
    'flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-colors outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
  icon: 'pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground motion-safe:transition-transform motion-safe:duration-200',
  content: 'overflow-hidden text-sm motion-safe:data-[state=open]:animate-detail-in',
  body: 'pt-0 pb-4',
}
