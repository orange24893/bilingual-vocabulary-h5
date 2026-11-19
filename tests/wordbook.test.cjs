const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeWord, switchWordbookLanguage, filterWordbook } = require('../src/utils/wordbook.cjs')

test('normalizes English and Korean within their own language', () => {
  assert.equal(normalizeWord('  Negligible   ', 'en'), 'negligible')
  assert.equal(normalizeWord('  resilient   learner ', 'en'), 'resilient learner')
  assert.equal(normalizeWord('사과', 'ko'), '사과'.normalize('NFC'))
})

test('language switch preserves filter and clears only search', () => {
  assert.deepEqual(
    switchWordbookLanguage({ language: 'en', filter: 'learning', query: 'neg' }, 'ko'),
    { language: 'ko', filter: 'learning', query: '' }
  )
})

test('filter never returns another language', () => {
  const words = [
    { id: 'e', language: 'en', text: 'negligible', definitionZh: '微不足道的', source: 'builtin' },
    { id: 'k', language: 'ko', text: '사과', definitionZh: '苹果', source: 'custom' }
  ]
  const result = filterWordbook(words, {}, { language: 'ko', filter: 'all', query: '' })
  assert.deepEqual(result.map(word => word.id), ['k'])
})

test('search and filters apply only inside the selected language', () => {
  const words = [
    { id: 'e1', language: 'en', text: 'negligible', definitionZh: '微不足道的', source: 'builtin' },
    { id: 'e2', language: 'en', text: 'resilient', definitionZh: '有韧性的', source: 'custom' },
    { id: 'k1', language: 'ko', text: '사과', definitionZh: '苹果', source: 'custom' }
  ]
  const states = {
    e1: { status: 'mastered' },
    e2: { status: 'learning' },
    k1: { status: 'learning' }
  }
  assert.deepEqual(filterWordbook(words, states, { language: 'en', filter: 'mastered', query: '' }).map(word => word.id), ['e1'])
  assert.deepEqual(filterWordbook(words, states, { language: 'en', filter: 'custom', query: '' }).map(word => word.id), ['e2'])
  assert.deepEqual(filterWordbook(words, states, { language: 'en', filter: 'all', query: '韧性' }).map(word => word.id), ['e2'])
})

test('wordbook paginates lightweight entries and loads details by ID', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/wordbook/index.tsx'), 'utf8')
  assert.doesNotMatch(source, /SEED_WORDS/)
  assert.match(source, /loadIndexEntries\(language\)/)
  assert.match(source, /paginate\(filteredEntries, page, 50\)/)
  assert.match(source, /visiblePage\.items\.map/)
  assert.match(source, /loadWord\(id\)/)
  assert.match(source, /detailRequest\.current !== requestId/)
  assert.match(source, /consumeOpenWordId\(\)/)
  assert.match(source, /TOPIK 分级参考/)
  assert.match(source, /switchWordbookLanguage\(view, language\)/)
})

test('custom word editor checks the whole library and allows missing images', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/word-edit/index.tsx'), 'utf8')
  assert.doesNotMatch(source, /SEED_WORDS/)
  assert.match(source, /await findDuplicate\(draft\.language, normalizedText, draft\.id\)/)
  assert.match(source, /await loadWord\(duplicate\.id\)/)
  assert.doesNotMatch(source, /请先生成配图/)
  assert.match(source, /三段音频齐全后才能保存；配图为可选内容。/)
  assert.match(source, /if \(!draft\.wordAudioUrl\)/)
  assert.match(source, /if \(!draft\.phrase\.audioUrl\)/)
  assert.match(source, /if \(!draft\.example\.audioUrl\)/)
  assert.match(source, /updateWordText = \(text: string\) => patch\(\{ text, wordAudioUrl: '' \}\)/)
})
