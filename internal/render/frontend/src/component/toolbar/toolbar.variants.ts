export const toolbarStyles = {
  panel:
    'material absolute z-10 rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-xl cursor-default touch-auto overscroll-contain',
  toolbar:
    'inset-x-2.5 top-2.5 flex min-h-15 flex-wrap items-center justify-between gap-2 p-2 min-[621px]:inset-x-4 min-[621px]:top-[max(1rem,env(safe-area-inset-top))] min-[621px]:flex-nowrap min-[621px]:gap-3',
  brand: 'flex shrink-0 items-center gap-2',
  brandIcon: 'text-xl text-primary',
  brandName: 'hidden font-semibold lg:inline',
  provenance: 'text-[.6rem] sm:text-xs',
  simulation: 'border-amber-700/50 bg-amber-950 text-amber-200',
  actions: 'flex shrink-0 items-center gap-1',
  modes: 'flex gap-0.5 rounded-lg border bg-background p-0.5',
  modeButton: 'max-sm:px-2 max-sm:text-xs',
  search: 'relative order-last w-full min-[621px]:order-0 min-[621px]:ml-auto min-[621px]:max-w-96',
  searchLabel: 'sr-only',
  searchIcon: 'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground',
  searchInput: 'h-10 bg-background pl-9',
  results:
    'absolute top-full left-0 mt-2 max-h-[50dvh] w-full min-[621px]:min-w-72 overflow-auto rounded-lg border bg-card shadow-lg',
  result:
    'block h-auto w-full rounded-none border-b px-3 py-2 text-left whitespace-normal wrap-anywhere last:border-0',
  resultDescription: 'mt-0.5 block text-xs text-muted-foreground',
  noMatches: 'p-3 text-sm',
  filters:
    'right-2.5 top-30 max-h-[calc(100dvh-10rem)] w-[min(330px,calc(100%-1.25rem))] overflow-auto p-5 text-sm min-[621px]:right-4 min-[621px]:top-22',
  filterTitle: 'mb-4 font-semibold',
  dependencies: 'flex items-center gap-2',
  topology: 'mt-4 space-y-2',
  legend: 'my-4 space-y-2',
  legendItem: 'flex items-center gap-2',
  legendLine: {
    triggers: 'w-6 border-t-2 border-primary',
    connects_to: 'w-6 border-t-2 border-dashed border-violet-300',
    depends_on: 'w-6 border-t border-dashed border-slate-400',
  },
  note: 'text-muted-foreground',
  simulationNote: 'mt-3 text-muted-foreground',
  zoom: 'bottom-[max(.75rem,env(safe-area-inset-bottom))] left-2.5 flex items-center p-1 sm:left-4',
  zoomLabel: 'min-w-12 text-center text-xs text-muted-foreground tabular-nums',
  fitButton: 'ml-1',
  summary:
    'pointer-events-none absolute right-3 bottom-4 max-w-[calc(100%-13rem)] rounded-lg border bg-card/95 p-2 text-[.625rem] text-muted-foreground sm:right-4 sm:text-xs',
  omitted: 'ml-2 hidden lg:inline',
}
