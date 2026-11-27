export const inputStyles = {
  base: 'h-9 w-full min-w-0 rounded-md border border-control-border bg-transparent px-3 py-1 text-base shadow-xs transition-[background-color,border-color,color,box-shadow] duration-(--motion-feedback) ease-(--motion-standard) outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
  focus: 'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring',
  invalid:
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
}
