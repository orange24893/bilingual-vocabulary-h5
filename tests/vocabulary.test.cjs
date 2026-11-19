const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { paginate, repairSession, sortIndexEntries } = require('../src/utils/vocabulary.cjs')
const { buildDailyQueue } = require('../src/utils/scheduler.cjs')

test('stable sorting uses priority, normalized text and ID', () => {
  const input = [
    { id: 'b', normalizedText: 'beta', priority: 1 },
    { id: 'a', normalizedText: 'alpha', priority: 1 },
    { id: 'first', normalizedText: 'z', priority: 0 }
  ]
  assert.deepEqual(sortIndexEntries(input).map(item => item.id), ['first', 'a', 'b'])
})

test('pagination is bounded and clamps the requested page', () => {
  const items = Array.from({ length: 101 }, (_, index) => ({ id: String(index) }))
  const result = paginate(items, 99, 50)
  assert.equal(result.page, 3)
  assert.equal(result.pageCount, 3)
  assert.equal(result.total, 101)
  assert.deepEqual(result.items.map(item => item.id), ['100'])
})

test('session repair skips only missing IDs and preserves the legacy eight', () => {
  const session = {
    wordIds: ['builtin-en-negligible', 'deleted', 'builtin-ko-sagwa'],
    currentWordIndex: 1,
    currentStepId: 'phrase',
    completedAudioKeys: ['word']
  }
  const repaired = repairSession(session, new Set(['builtin-en-negligible', 'builtin-ko-sagwa']))
  assert.deepEqual(repaired.wordIds, ['builtin-en-negligible', 'builtin-ko-sagwa'])
  assert.equal(repaired.currentWordIndex, 1)
  assert.equal(repaired.currentStepId, 'word')
  assert.deepEqual(repaired.completedAudioKeys, [])
})

test('index-shaped words build queues without images and exclude incomplete content', () => {
  const words = [
    { id: 'ready', language: 'en', contentStatus: 'ready', normalizedText: 'ready' },
    { id: 'incomplete', language: 'en', contentStatus: 'incomplete', normalizedText: 'incomplete' },
    { id: 'korean', language: 'ko', contentStatus: 'ready', normalizedText: '사과' }
  ]
  const queue = buildDailyQueue({
    words,
    states: {},
    today: '2026-11-17',
    language: 'en',
    newTarget: 30,
    completedNewIds: []
  })
  assert.deepEqual(queue.newIds, ['ready'])
})

test('dashboard loads lightweight indices asynchronously and guards stale refreshes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/index/index.tsx'), 'utf8')
  assert.doesNotMatch(source, /SEED_WORDS|loadCustomWords/)
  assert.match(source, /Promise\.all\(\[\s*loadIndexEntries\('en'\),\s*loadIndexEntries\('ko'\)\s*\]\)/)
  assert.match(source, /dashboardRequest\.current !== requestId/)
  assert.match(source, /refreshDashboard\(true\)/)
  assert.match(source, /resetVocabularyCache\(\)/)
})

test('H5 build copies the published static vocabulary into its output directory', () => {
  const source = fs.readFileSync(path.join(__dirname, '../config/index.ts'), 'utf8')
  assert.match(source, /from:\s*'public\/static'/)
  assert.match(source, /chain\.plugin\('copyWebpackPlugin'\)\.tap/)
  assert.match(source, /path\.resolve\(chain\.output\.get\('path'\), 'static'\)/)
  assert.match(source, /import path from 'node:path'/)
  assert.doesNotMatch(source, /to:\s*path\.resolve\(process\.env\.TARO_OUTPUT_DIR/)
})
