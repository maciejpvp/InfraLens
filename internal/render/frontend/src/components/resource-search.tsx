import { Box } from '../ui/box'
import { Icon } from '../ui/icon'
import { Label } from '../ui/label'
import { Text } from '../ui/text'
import type { useToolbar } from '../hooks/use-toolbar'

import { Search } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { toolbarStyles as styles } from './toolbar.variants'

export const ResourceSearch = ({
  search,
  resultsRef,
  searching,
  noMatches,
  searchInput,
  searchKeys,
  results,
}: ReturnType<typeof useToolbar>['searchProps']) => (
  <Box className={styles.search}>
    <Label className={styles.searchLabel} htmlFor="search">
      Search resources
    </Label>
    <Icon icon={Search} className={styles.searchIcon} aria-hidden="true" />
    <Input
      id="search"
      ref={search}
      type="search"
      placeholder="Search resources or groups…"
      autoComplete="off"
      aria-controls="results"
      className={styles.searchInput}
      onInput={searchInput}
      onKeyDown={searchKeys}
    />
    <Box id="results" ref={resultsRef} aria-live="polite" hidden={!searching} className={styles.results}>
      {results.map(({ id, name, description, onClick }) => (
        <Button key={id} data-resource={id} variant="ghost" className={styles.result} onClick={onClick}>
          {name}
          <Text className={styles.resultDescription}>{description}</Text>
        </Button>
      ))}
      {noMatches && (
        <Text as="p" className={styles.noMatches}>
          No resources found.
        </Text>
      )}
    </Box>
  </Box>
)
