const test = require('node:test')
const assert = require('node:assert/strict')
const { addDays, getToday, nextStudyState, buildDailyQueue, calculateStreak } = require('../src/utils/scheduler.cjs')

test('addDays uses calendar dates', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

test('getToday formats the device local calendar date', () => {
  assert.equal(getToday(new Date(2026, 10, 17, 23, 59)), '2026-11-17')
})

test('known ratings follow nominal D1 D2 D4 D7 D15 D30 D60 intervals', () => {
  const offsets = [1, 1, 2, 3, 8, 15, 30]
  for (let stage = 0; stage < offsets.length; stage++) {
    const result = nextStudyState({ stage, status: 'learning', history: [] }, 'known', '2026-11-17')
    assert.equal(result.nextDueDate, addDays('2026-11-17', offsets[stage]))
    assert.equal(result.stage, stage + 1)
  }
})

test('fuzzy repeats and unknown resets', () => {
  const base = { stage: 4, status: 'learning', history: [] }
  assert.equal(nextStudyState(base, 'fuzzy', '2026-11-17').stage, 4)
  assert.equal(nextStudyState(base, 'fuzzy', '2026-11-17').nextDueDate, '2026-11-18')
  assert.equal(nextStudyState(base, 'unknown', '2026-11-17').stage, 0)
  assert.equal(nextStudyState(base, 'unknown', '2026-11-17').nextDueDate, '2026-11-18')
})

test('D60 known becomes mastered', () => {
  const result = nextStudyState({ stage: 7, status: 'learning', history: [] }, 'known', '2026-11-17')
  assert.equal(result.status, 'mastered')
  assert.equal(result.stage, 7)
})

test('queue is single-language, overdue-first and target-limited', () => {
  const words = [
    { id: 'en1', language: 'en', contentStatus: 'ready' },
    { id: 'en2', language: 'en', contentStatus: 'ready' },
    { id: 'en3', language: 'en', contentStatus: 'ready' },
    { id: 'ko1', language: 'ko', contentStatus: 'ready' },
    { id: 'draft', language: 'en', contentStatus: 'incomplete' }
  ]
  const states = {
    en1: { language: 'en', status: 'learning', nextDueDate: '2026-11-10', stage: 1 },
    en2: { language: 'en', status: 'learning', nextDueDate: '2026-11-01', stage: 2 },
    ko1: { language: 'ko', status: 'learning', nextDueDate: '2026-11-01', stage: 1 }
  }
  const queue = buildDailyQueue({ words, states, today: '2026-11-17', language: 'en', newTarget: 1, completedNewIds: [] })
  assert.deepEqual(queue.reviewIds, ['en2', 'en1'])
  assert.deepEqual(queue.newIds, ['en3'])
})

test('streaks are language-specific and preserve yesterday when today is empty', () => {
  const records = {
    '2026-11-17:en': { completedNewIds: ['a'], completedReviewIds: [] },
    '2026-11-16:en': { completedNewIds: [], completedReviewIds: ['b'] },
    '2026-11-14:en': { completedNewIds: ['c'], completedReviewIds: [] },
    '2026-11-16:ko': { completedNewIds: ['k'], completedReviewIds: [] }
  }
  assert.equal(calculateStreak(records, 'en', '2026-11-17'), 2)
  assert.equal(calculateStreak(records, 'ko', '2026-11-17'), 1)
  assert.equal(calculateStreak(records, 'en', '2026-11-15'), 1)
})

test('daily new-word target accounts for words already completed', () => {
  const words = [
    { id: 'a', language: 'en', contentStatus: 'ready' },
    { id: 'b', language: 'en', contentStatus: 'ready' },
    { id: 'c', language: 'en', contentStatus: 'ready' }
  ]
  const queue = buildDailyQueue({ words, states: {}, today: '2026-11-17', language: 'en', newTarget: 2, completedNewIds: ['a'] })
  assert.deepEqual(queue.newIds, ['b'])
})
