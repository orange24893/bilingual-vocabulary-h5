const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { getSteps, canAdvance, completeAudio, interruptAudio } = require('../src/utils/study-flow.cjs')

test('English and Korean reveal definitions in confirmed order', () => {
  assert.deepEqual(getSteps('en').map(step => step.id), ['word', 'definitionZh', 'phrase', 'example'])
  assert.deepEqual(getSteps('ko').map(step => step.id), ['word', 'definitionKo', 'definitionZh', 'phrase', 'example'])
})

test('audio steps unlock only after matching completion', () => {
  const wordStep = getSteps('en')[0]
  assert.equal(canAdvance(wordStep, []), false)
  assert.equal(canAdvance(wordStep, ['phrase']), false)
  assert.equal(canAdvance(wordStep, ['word']), true)
  assert.equal(canAdvance(getSteps('en')[1], []), true)
})

test('completion is idempotent and scoped to the audio key', () => {
  assert.deepEqual(completeAudio([], 'word'), ['word'])
  assert.deepEqual(completeAudio(['word'], 'word'), ['word'])
  assert.deepEqual(completeAudio(['word'], 'phrase'), ['word', 'phrase'])
})

test('interruption revokes completion and cannot unlock', () => {
  const completed = completeAudio([], 'word')
  assert.deepEqual(interruptAudio(completed, 'word'), [])
  assert.equal(canAdvance(getSteps('en')[0], interruptAudio(completed, 'word')), false)
})

test('study page loads only the current word and repairs stale session IDs', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/study/index.tsx'), 'utf8')
  assert.doesNotMatch(source, /SEED_WORDS|loadCustomWords/)
  assert.match(source, /loadIndexEntries\(language\)/)
  assert.match(source, /repairSession\(existing, new Set\(words\.map\(word => word\.id\)\)\)/)
  assert.match(source, /loadWord\(currentWordId\)/)
  assert.match(source, /wordRequest\.current !== requestId/)
  assert.match(source, /resetVocabularyCache\(\)/)
  assert.match(source, /onClick=\{\(\) => void createSession\('new'\)\}/)
  assert.match(source, /useDidHide\(interruptCurrentAudio\)/)
  assert.match(source, /useUnload\(interruptCurrentAudio\)/)
})

test('H5 audio play rejections are handled and intentional stops stay quiet', () => {
  const audio = fs.readFileSync(path.join(__dirname, '../src/services/audio.ts'), 'utf8')
  const gate = fs.readFileSync(path.join(__dirname, '../src/components/AudioGate/index.tsx'), 'utf8')
  assert.match(audio, /void Promise\.resolve\(context\.play\(\)\)\.catch\(rejectPending\)/)
  assert.match(audio, /error\.name = 'AbortError'/)
  assert.match(gate, /if \(error\?\.name !== 'AbortError'\) console\.error/)
})
