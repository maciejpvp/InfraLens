import { Filter, Search, X } from 'lucide-react'
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { ServiceIcon } from '../../components/service-icon'
import { countLabel, serviceIconSrc } from '../../lib/graph-view'
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
  search: 'relative order-last w-full min-w-0 min-[621px]:order-0 min-[621px]:ml-auto min-[621px]:max-w-md',
  searchControls: 'flex items-center gap-1.5',
  searchField: 'relative min-w-0 flex-1',
  searchLabel: 'sr-only',
  searchIcon: 'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground',
  searchInput: 'h-10 rounded-full bg-background/70 pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden',
  clearSearch: 'absolute right-1 top-1/2 -translate-y-1/2 rounded-full text-muted-foreground',
  searchFilterButton: 'min-w-10 rounded-full border-border bg-background/70 px-2.5 has-[>svg]:px-2.5',
  searchPanel:
    'absolute top-full right-0 z-10 mt-2 max-h-[min(55dvh,calc(100dvh-9rem))] w-full overflow-auto overscroll-contain rounded-2xl border bg-card shadow-panel min-[621px]:min-w-64',
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
    if (pendingFocus.current) {
      if (searching) moveFocus(pendingFocus.current)
      pendingFocus.current = null
    }
  }, [searching, page])

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
      <Box className={styles.searchControls}>
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
        <Button type="button" variant={activeCount || filtersOpen ? 'secondary' : 'outline'} size="lg"
          className={styles.searchFilterButton} aria-label={activeCount ? `Search filters (${activeCount} active)` : 'Search filters'}
          aria-controls="search-filters" aria-expanded={filtersOpen} onClick={toggleFilters}>
          <Icon icon={Filter} aria-hidden="true" />
          {activeCount > 0 && <span aria-hidden="true" className="tabular-nums">{activeCount}</span>}
        </Button>
      </Box>
      <Box as="section" id="search-filters" aria-label="Search filters" hidden={!filtersOpen} className={styles.searchPanel}>
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
      <Box as="section" id="results" aria-label="Search results" ref={resultsRef} hidden={!searching}
        className={paged ? `${styles.searchPanel} scroll-pt-14` : styles.searchPanel}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          if (!(event.target instanceof HTMLButtonElement) || !event.target.hasAttribute('data-resource')) return
          event.preventDefault()
          moveFocus(event.key, event.target)
        }}>
        {searching && (
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
