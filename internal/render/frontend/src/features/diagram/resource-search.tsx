import { Filter, Search, X } from 'lucide-react'
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { ServiceIcon } from '../../components/service-icon'
import { countLabel, serviceIconSrc } from '../../lib/graph-view'
import { cn } from '../../lib/utils'
import { overlayPanelClass } from '../../components/overlay-styles'
import { Box } from '../../ui/box'
import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Icon } from '../../ui/icon'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Text } from '../../ui/text'
import { searchFacets } from './search-resources'
import { useToolbar } from './use-toolbar'

const styles = {
  search: 'min-w-0 min-[700px]:relative min-[700px]:w-full min-[700px]:max-w-xs',
  searchControls: 'search-controls flex items-center gap-1 max-[700px]:absolute max-[700px]:inset-x-2 max-[700px]:top-full max-[700px]:mt-1 max-[700px]:rounded-md max-[700px]:border max-[700px]:bg-card max-[700px]:p-1 max-[700px]:shadow-panel',
  searchField: 'relative min-w-0 flex-1',
  searchLabel: 'sr-only',
  searchIcon: 'pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground',
  searchInput: 'h-8 bg-background pr-7 pl-7 text-sm [&::-webkit-search-cancel-button]:hidden',
  clearSearch: 'absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground',
  searchFilterButton: 'h-8 gap-1 px-2 text-xs has-[>svg]:px-2',
  searchPanel:
    cn(overlayPanelClass, 'top-full right-0 mt-1 max-h-[min(55dvh,calc(100dvh-8rem))] min-[700px]:w-full min-[700px]:min-w-64 max-[700px]:inset-x-2 max-[700px]:top-[calc(100%+2.9rem)]'),
  searchFilterHeader: 'sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-3 py-2',
  searchFacet: 'mx-3 my-2 min-w-0 border-b pb-2 last:border-0',
  searchFacetTitle: 'py-1 text-xs font-semibold text-muted-foreground',
  searchFacetRow: 'flex min-h-8 items-center gap-2 px-1',
  searchFacetLabel: 'flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1',
  result:
    'flex h-auto w-full justify-start rounded-none border-b px-3 py-2 text-left whitespace-normal wrap-anywhere last:border-0 focus-visible:ring-inset',
  resultDescription: 'mt-0.5 block text-xs text-muted-foreground',
  resultCount: 'border-b px-3 py-2 text-xs text-muted-foreground',
}

const facetLabels = { service: 'Services', stack: 'Stacks', change: 'Changes' }

export function ResourceSearch({
  search,
  searchRoot,
  icons,
  query,
  searching,
  compactOpen,
  toggleSearch,
  filtersOpen,
  facets,
  searchFilters,
  activeCount,
  selectFilter,
  clearFilters,
  toggleFilters,
  showResults,
  changeQuery,
  page,
  offset,
  total,
  changePage,
  results,
}: ReturnType<typeof useToolbar>['searchProps']) {
  const resultsRef = useRef<HTMLDivElement>(null)
  const focusSearch = useRef(false)
  const pendingFocus = useRef<'ArrowDown' | 'ArrowUp' | null>(null)
  const hasPrevious = page > 0
  const hasNext = offset + results.length < total
  const paged = hasPrevious || hasNext
  const goToPage = (index: number, focus: 'ArrowDown' | 'ArrowUp') => {
    pendingFocus.current = focus
    changePage(index)
  }
  const moveFocus = (key: 'ArrowDown' | 'ArrowUp', from?: EventTarget) => {
    const buttons = [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>('button[data-resource]') ?? [])]
    const index = buttons.findIndex((button) => button === from)
    if (key === 'ArrowDown') {
      if (from && index === buttons.length - 1 && hasNext) goToPage(page + 1, key)
      else buttons[Math.min(index + 1, buttons.length - 1)]?.focus()
    } else if (index === 0) {
      if (hasPrevious) goToPage(page - 1, key)
      else search.current?.focus()
    } else buttons.at(index === -1 ? -1 : index - 1)?.focus()
  }

  useLayoutEffect(() => {
    if (compactOpen && focusSearch.current) {
      search.current?.focus()
      focusSearch.current = false
    }
    if (pendingFocus.current) {
      if (searching) moveFocus(pendingFocus.current)
      pendingFocus.current = null
    }
  }, [compactOpen, searching, page, search])

  const searchKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && searching) {
      resultsRef.current?.querySelector<HTMLButtonElement>('button[data-resource]')?.click()
      event.preventDefault()
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && (query.trim() || activeCount)) {
      if (searching) moveFocus(event.key)
      else {
        pendingFocus.current = event.key
        showResults()
      }
      event.preventDefault()
    }
  }

  let resultStatus = 'No resources found.'
  if (paged) resultStatus = `${offset + 1}–${offset + results.length} of ${countLabel(total, 'result')}`
  else if (total) resultStatus = countLabel(total, 'result')

  return (
    <Box ref={searchRoot} className={styles.search}>
      <Button id="search-toggle" type="button" size="icon-sm" variant="ghost" className="min-[700px]:hidden"
        aria-label="Search resources" title="Search resources" aria-expanded={compactOpen} aria-controls="search-controls"
        onClick={() => {
          focusSearch.current = !compactOpen
          toggleSearch()
        }}>
        <Icon icon={Search} />
      </Button>
      <Box id="search-controls" data-open={compactOpen} className={cn(styles.searchControls, !compactOpen && 'max-[700px]:hidden')}>
        <Box className={styles.searchField}>
          <Label className={styles.searchLabel} htmlFor="search">Search resources</Label>
          <Icon icon={Search} className={styles.searchIcon} aria-hidden="true" />
          <Input
            id="search"
            ref={search}
            type="search"
            value={query}
            placeholder="Search resources…"
            autoComplete="off"
            aria-controls="results"
            className={styles.searchInput}
            onInput={(event) => changeQuery(event.currentTarget.value)}
            onClick={showResults}
            onKeyDown={searchKeys}
          />
          {query && (
            <Button type="button" variant="ghost" size="icon-sm" className={styles.clearSearch} aria-label="Clear search"
              onClick={() => {
                changeQuery('')
                search.current?.focus()
              }}>
              <Icon icon={X} aria-hidden="true" />
            </Button>
          )}
        </Box>
        <Button type="button" variant={activeCount || filtersOpen ? 'secondary' : 'ghost'} size="sm"
          className={styles.searchFilterButton} aria-label={activeCount ? `Search filters (${activeCount} active)` : 'Search filters'}
          title="Search filters" aria-controls="search-filters" aria-expanded={filtersOpen} onClick={toggleFilters}>
          <Icon icon={Filter} aria-hidden="true" />
          {activeCount > 0 && <span aria-hidden="true" className="tabular-nums">{activeCount}</span>}
        </Button>
      </Box>
      <Box as="section" id="search-filters" aria-label="Search filters" data-motion-popover hidden={!filtersOpen} inert={!filtersOpen} className={styles.searchPanel}>
        <Box className={styles.searchFilterHeader}>
          <Button type="button" variant="ghost" size="sm" disabled={!activeCount} onClick={clearFilters}>Clear filters</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => {
            showResults()
            search.current?.focus()
          }}>Show results</Button>
        </Box>
        {searchFacets.map((facet) => facets[facet].length > 0 && (
          <fieldset key={facet} className={styles.searchFacet}>
            <legend className={styles.searchFacetTitle}>{facetLabels[facet]}</legend>
            {facets[facet].map(({ value, label, count, service }, index) => {
              const id = `search-filter-${facet}-${index}`
              return (
                <div key={value} className={styles.searchFacetRow}>
                  <Checkbox id={id} checked={searchFilters[facet]?.has(value) ?? false}
                    onCheckedChange={(checked) => selectFilter(facet, value, checked === true)} />
                  <Label htmlFor={id} className={styles.searchFacetLabel}>
                    {service && <ServiceIcon icon={serviceIconSrc(service, icons)} />}
                    <span className="min-w-0 flex-1 wrap-anywhere">{label}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{count}</span>
                  </Label>
                </div>
              )
            })}
          </fieldset>
        ))}
      </Box>
      <Box as="section" id="results" aria-label="Search results" ref={resultsRef} data-motion-popover hidden={!searching} inert={!searching}
        className={paged ? `${styles.searchPanel} scroll-pt-14` : styles.searchPanel}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          if (!(event.target instanceof HTMLButtonElement) || !event.target.hasAttribute('data-resource')) return
          event.preventDefault()
          moveFocus(event.key, event.target)
        }}>
        {(searching || results.length > 0) && (
          <Box className={paged ? styles.searchFilterHeader : undefined}>
            <Text as="p" role="status" className={paged ? 'text-xs text-muted-foreground' : styles.resultCount}>
              {resultStatus}
            </Text>
            {paged && <Box className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={!hasPrevious}
                onClick={() => goToPage(page - 1, 'ArrowDown')}>Previous</Button>
              <Button type="button" variant="ghost" size="sm" disabled={!hasNext}
                onClick={() => goToPage(page + 1, 'ArrowDown')}>Next</Button>
            </Box>}
          </Box>
        )}
        {results.map(({ id, name, description, service, onClick }) => (
          <Button type="button" key={id} data-resource={id} variant="ghost" className={styles.result} onClick={onClick}>
            <ServiceIcon icon={serviceIconSrc(service, icons)} />
            <span className="min-w-0">
              {name}
              <Text className={styles.resultDescription}>{description}</Text>
            </span>
          </Button>
        ))}
      </Box>
    </Box>
  )
}
