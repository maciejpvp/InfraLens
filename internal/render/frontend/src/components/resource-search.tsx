import { useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Filter, Search, X } from 'lucide-react'
import type { useToolbar } from '../hooks/use-toolbar'
import { countLabel, serviceIconSrc } from '../lib/graph-view'
import { searchFacets } from '../lib/resource-search'
import { Box } from '../ui/box'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Icon } from '../ui/icon'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Text } from '../ui/text'
import { ServiceIcon } from './service-icon'
import { toolbarStyles as styles } from './toolbar.variants'

const facetLabels = { service: 'Services', stack: 'Stacks', change: 'Changes' }

export const ResourceSearch = ({
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
}: ReturnType<typeof useToolbar>['searchProps']) => {
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
              {paged ? `${offset + 1}–${offset + results.length} of ${countLabel(total, 'result')}`
                : total ? countLabel(total, 'result') : 'No resources found.'}
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
