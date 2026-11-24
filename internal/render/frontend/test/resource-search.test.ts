import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Resource } from '../src/lib/graph.types.ts'
import type { SearchFilters } from '../src/features/diagram/search-resources.ts'
import { indexResources, searchResources } from '../src/features/diagram/search-resources.ts'

const resource = (id: string, name: string, service: string, extra?: Partial<Resource>): Resource => ({
  id, name, service, provider: 'aws', type: 'AWS::Lambda::Function', ...extra,
})

const { entries, facets } = indexResources([
  resource('dev', 'ImageWorker', 'lambda', { stack: 'dev', change: 'update' }),
  resource('prod', 'ImageWorker', 'lambda', { stack: 'prod' }),
  resource('backup', 'ImageWorkerBackup', 'lambda', { stack: 'prod', change: 'delete' }),
  resource('bucket', 'ImageStorage', 's3', { type: 'AWS::S3::Bucket', stack: 'prod', change: 'update' }),
  resource('custom', 'SearchDomain', 'future-service', { type: 'AWS::Future::Domain' }),
  { id: 'unknown', name: 'Other', type: 'test:Other' },
])
const find = (query: string, filters: SearchFilters = {}) =>
  searchResources(entries, query, filters).map(({ node }) => node.id)

test('ranks exact names before other matches and allows one typo across searchable fields', () => {
  assert.deepEqual(find('IMAGEWORKER'), ['dev', 'prod', 'backup'])
  assert.deepEqual(find('image lmbda dev'), ['dev'])
  assert.deepEqual(find('image lamdba dev'), ['dev'])
  assert.deepEqual(find('image lamdda dev'), ['dev'])
  assert.deepEqual(find('image lambdax dev'), ['dev'])
  assert.deepEqual(find('image lmxxa dev'), [])
  assert.deepEqual(find('s3 bucket prod'), ['bucket'])
  assert.deepEqual(find('future service domain'), ['custom'])
  assert.deepEqual(find('---'), [])
})

test('builds facets from reported resources and combines values within and across facets', () => {
  assert.deepEqual(Object.fromEntries(facets.service.map(({ label, count }) => [label, count])), {
    'future-service': 1, Lambda: 3, S3: 1, Unknown: 1,
  })
  assert.equal(facets.stack.find(({ value }) => value === '')?.count, 2)
  assert.equal(facets.change.find(({ value }) => value === 'unchanged')?.count, 3)
  const filters = {
    service: new Set(['aws:lambda', 'aws:s3']),
    stack: new Set(['prod']),
    change: new Set(['unchanged', 'update']),
  }
  assert.deepEqual(find('', filters), ['bucket', 'prod'])
  assert.deepEqual(find('lamdba', filters), ['prod'])
  assert.deepEqual(find('', { stack: new Set(['']), change: new Set(['unchanged']) }), ['unknown', 'custom'])
  assert.deepEqual(find('', { service: new Set(['aws:future-service']), stack: new Set(['dev']) }), [])
})
