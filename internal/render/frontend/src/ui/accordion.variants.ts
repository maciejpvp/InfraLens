export const accordionStyles = {
  item: 'border-b last:border-b-0',
  header: 'flex',
  trigger:
    'flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
  icon: 'pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200',
  content:
    'overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
  body: 'pt-0 pb-4',
}
