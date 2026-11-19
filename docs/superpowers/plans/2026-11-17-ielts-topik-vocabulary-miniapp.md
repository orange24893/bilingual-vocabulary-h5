# IELTS / TOPIK Vocabulary Miniapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project constraint:** This project must execute inline through `executing-plans`; the active Taro generation skill forbids subagents. Do not run native `npm`, `npx`, or Taro CLI commands. Do not create commits unless the user separately requests them.

**Goal:** Build a runnable Taro WeChat miniapp with separate IELTS and TOPIK learning queues, Ebbinghaus reviews, staged definitions, unskippable audio, editable generated vocabulary, and local progress persistence.

**Architecture:** Taro/React pages call small domain modules for scheduling, wordbook filtering, and study-flow state. Taro storage persists user data locally; a service adapter calls a secure HTTPS generation endpoint, while curated built-in words keep the preview useful without credentials. Audio unlocking is driven only by media completion events.

**Tech Stack:** Taro, React, TypeScript, CSS, `@tarojs/components`, Taro `InnerAudioContext`, Taro storage, Node.js built-in `node:test`, miniapp-builder MCP, TRAE Taro template scripts, AgentEarth-generated seed media.

---

## File Map

- `src/app.ts`, `src/app.config.ts`, `src/app.css`: application bootstrap, routes, text-only tab bar, visual tokens.
- `src/types/word.ts`: `Language`, `Word`, `StudyState`, `DailyProgress`, `SessionProgress`, settings and generation DTOs.
- `src/data/seed.ts`: curated English and Korean words with complete definitions, examples and media references.
- `src/utils/scheduler.cjs`: local-date arithmetic, queue construction and review-state transitions.
- `src/utils/wordbook.cjs`: language-safe normalization, filtering, search and language-switch state.
- `src/utils/study-flow.cjs`: language-specific step lists and audio-gate transitions.
- `src/services/storage.ts`: versioned local repositories and session recovery.
- `src/services/generator.ts`: validated HTTPS generation client with explicit unavailable/error states.
- `src/services/audio.ts`: single-current-audio playback wrapper using `Taro.createInnerAudioContext`.
- `src/components/LanguageSwitch.tsx`: reusable controlled English/Korean segmented control.
- `src/components/AudioGate.tsx`: status, replay and completion reporting; no seek or skip UI.
- `src/pages/index/index.tsx`: separate language dashboards and session entry.
- `src/pages/study/index.tsx`: staged word learning and mastery feedback.
- `src/pages/wordbook/index.tsx`: independent language list, search, filters and details.
- `src/pages/word-edit/index.tsx`: add, generate, validate and edit a word.
- `src/pages/profile/index.tsx`: per-language targets, statistics and cache controls.
- `cloud/generate-word/index.js`: reference secure HTTPS serverless handler for text, image and speech providers.
- `cloud/generate-word/providers.js`: OpenAI-compatible generation and CloudBase media upload.
- `cloud/generate-word/validate.js`: server-side response validation and language checks.
- `cloud/generate-word/package.json`: CloudBase function runtime dependency.
- `tests/*.test.cjs`: deterministic domain tests runnable without npm commands.

## Task 1: Initialize and configure the Taro project

**Files:**
- Create through required tools: project template under the workspace root.
- Modify: `package.json`
- Modify: `src/app.config.ts`
- Modify: `src/app.ts`
- Modify: `src/app.css`

- [ ] **Step 1: Bind the active Taro generation assets**

Run:

```powershell
node "c:\Users\28191\.trae-cn\builtin_skills\TRAE-generate-mini-app\scripts\get-skill-assets-dir.js"
```

Expected: JSON containing `skill_assets_dir`. Use that directory for every later prompt and script path. If an updated script path is returned, switch to it immediately.

- [ ] **Step 2: Check miniapp-builder and read the required prompts**

Call `prepare(action: "check")` with the absolute workspace as `projectRoot`. Read the returned `${skill_assets_dir}/prompts/system-prompt.md` and `ui-ux-design-principles.md` in full, plus the miniapp-builder WeChat reference. Expected: the environment is usable and all template constraints are known before editing.

- [ ] **Step 3: Initialize only through the required template script**

Run:

```powershell
node "${skill_assets_dir}/scripts/init-template.js"
```

Expected: a new Taro project in the current empty workspace. Do not replace the template source and do not run `npm create`, `npx taro`, or `taro init`.

- [ ] **Step 4: Install template dependencies through miniapp-builder**

Call `prepare(action: "install")` with the workspace `projectRoot`; track the returned operation with `status(operationId)` until it succeeds. Expected: dependencies are installed without a native npm command. If installation rejects the generated template, read the returned operation error and `inspect(source: "compile")`; do not initialize a second project over the existing files.

- [ ] **Step 5: Set real metadata and independent routes**

Set `package.json` fields to:

```json
{
  "name": "bilingual-vocabulary-miniapp",
  "displayName": "双语单词本",
  "description": "IELTS 英语与 TOPIK 韩语独立学习、艾宾浩斯复习和分层释义词汇小程序。"
}
```

Configure these pages and three text-only tab entries in `src/app.config.ts`:

```ts
export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/study/index',
    'pages/wordbook/index',
    'pages/word-edit/index',
    'pages/profile/index'
  ],
  window: {
    navigationBarTitleText: '双语单词本',
    navigationBarBackgroundColor: '#F6F7F2',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F6F7F2'
  },
  tabBar: {
    color: '#73776E',
    selectedColor: '#1F5A4A',
    backgroundColor: '#FFFFFF',
    list: [
      { pagePath: 'pages/index/index', text: '学习' },
      { pagePath: 'pages/wordbook/index', text: '生词本' },
      { pagePath: 'pages/profile/index', text: '我的' }
    ]
  }
})
```

Use ASCII class names and explicit Taro `Image` dimensions throughout. Keep `study` and `word-edit` out of the tab bar.

## Task 2: Define domain types and complete seed words

**Files:**
- Create: `src/types/word.ts`
- Create: `src/data/seed.ts`
- Create: `src/assets/words/.gitkeep`

- [ ] **Step 1: Add shared domain contracts**

```ts
export type Language = 'en' | 'ko'
export type Rating = 'known' | 'fuzzy' | 'unknown'
export type ContentStatus = 'generating' | 'incomplete' | 'ready'

export interface Word {
  id: string
  language: Language
  text: string
  normalizedText: string
  pronunciation: string
  definitionEn: string
  definitionKo?: string
  definitionZh: string
  imageUrl: string
  wordAudioUrl: string
  phrase: { text: string; translationZh: string; audioUrl: string }
  example: { text: string; translationZh: string; audioUrl: string }
  source: 'builtin' | 'custom'
  contentStatus: ContentStatus
}

export interface StudyState {
  wordId: string
  language: Language
  stage: number
  firstLearnedDate?: string
  lastCompletedDate?: string
  nextDueDate: string
  status: 'learning' | 'mastered'
  history: Array<{ date: string; rating: Rating; stage: number }>
}

export interface DailyProgress {
  date: string
  language: Language
  newTarget: number
  completedNewIds: string[]
  completedReviewIds: string[]
}

export interface SessionProgress {
  date: string
  language: Language
  wordIds: string[]
  currentWordIndex: number
  currentStepId: string
  completedAudioKeys: string[]
  mode: 'review' | 'new'
}

export interface Settings {
  dailyTargets: Record<Language, number>
  lastLearningLanguage: Language
}

export interface WordbookView {
  language: Language
  filter: 'all' | 'learning' | 'mastered' | 'custom'
  query: string
}
```

- [ ] **Step 2: Validate and add curated words**

Create exactly eight initial curated entries: English `negligible`, `resilient`, `ambiguous`, `scrutinize`; Korean `사과`, `시간`, `약속`, `공부하다`. Every `ready` word must have both required definitions, Korean `definitionKo`, Chinese translations, phrase, example, image and three audio references. Use `normalizedText` values produced by the wordbook normalizer in Task 4. Queue limit tests use synthetic words, so the eight seed entries do not weaken daily-target testing.

- [ ] **Step 3: Generate real seed media with AgentEarth**

Use AgentEarth image and audio capabilities to create meaningful illustrations and standard English/Korean pronunciation for the seed words. Save resources under `src/assets/words/` with names such as `negligible.png`, `negligible-word.mp3`, `negligible-phrase.mp3`, `negligible-example.mp3`, and equivalent stable ASCII names for Korean entries. Do not use placeholder images or silent audio. Record only resource paths in `seed.ts`, never service credentials.

## Task 3: Implement scheduling with deterministic tests

**Files:**
- Create: `src/utils/scheduler.cjs`
- Test: `tests/scheduler.test.cjs`

- [ ] **Step 1: Write failing scheduler tests**

Use a fixed date and test language isolation, overdue ordering, daily new-word limits, intervals, fuzzy repetition, unknown reset and D60 mastery:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { addDays, nextStudyState, buildDailyQueue } = require('../src/utils/scheduler.cjs')

test('addDays uses calendar dates', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
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
})

test('D60 known becomes mastered', () => {
  const result = nextStudyState({ stage: 7, status: 'learning', history: [] }, 'known', '2026-11-17')
  assert.equal(result.status, 'mastered')
})

test('queue is single-language, overdue-first and target-limited', () => {
  const words = [
    { id: 'en1', language: 'en', contentStatus: 'ready' },
    { id: 'en2', language: 'en', contentStatus: 'ready' },
    { id: 'ko1', language: 'ko', contentStatus: 'ready' }
  ]
  const states = {
    en1: { language: 'en', status: 'learning', nextDueDate: '2026-11-10', stage: 1 },
    ko1: { language: 'ko', status: 'learning', nextDueDate: '2026-11-01', stage: 1 }
  }
  const queue = buildDailyQueue({ words, states, today: '2026-11-17', language: 'en', newTarget: 1, completedNewIds: [] })
  assert.deepEqual(queue.reviewIds, ['en1'])
  assert.deepEqual(queue.newIds, ['en2'])
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test tests/scheduler.test.cjs
```

Expected: FAIL because `scheduler.cjs` does not exist.

- [ ] **Step 3: Implement the scheduler**

```js
const INTERVALS = [1, 1, 2, 3, 8, 15, 30]

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function nextStudyState(state, rating, today) {
  const history = [...(state.history || []), { date: today, rating, stage: state.stage }]
  if (rating === 'unknown') {
    return { ...state, stage: 0, status: 'learning', nextDueDate: addDays(today, 1), lastCompletedDate: today, history }
  }
  if (rating === 'fuzzy') {
    return { ...state, status: 'learning', nextDueDate: addDays(today, 1), lastCompletedDate: today, history }
  }
  if (state.stage >= 7) {
    return { ...state, stage: 7, status: 'mastered', lastCompletedDate: today, history }
  }
  return {
    ...state,
    stage: state.stage + 1,
    status: 'learning',
    firstLearnedDate: state.firstLearnedDate || today,
    lastCompletedDate: today,
    nextDueDate: addDays(today, INTERVALS[state.stage]),
    history
  }
}

function buildDailyQueue({ words, states, today, language, newTarget, completedNewIds }) {
  const languageWords = words.filter(word => word.language === language && word.contentStatus === 'ready')
  const reviewIds = languageWords
    .filter(word => {
      const state = states[word.id]
      return state && state.status === 'learning' && state.nextDueDate <= today
    })
    .sort((a, b) => states[a.id].nextDueDate.localeCompare(states[b.id].nextDueDate) || a.id.localeCompare(b.id))
    .map(word => word.id)
  const remaining = Math.max(0, newTarget - completedNewIds.length)
  const newIds = languageWords
    .filter(word => !states[word.id] && !completedNewIds.includes(word.id))
    .slice(0, remaining)
    .map(word => word.id)
  return { reviewIds, newIds }
}

module.exports = { INTERVALS, addDays, nextStudyState, buildDailyQueue }
```

- [ ] **Step 4: Run scheduler tests and verify success**

Run `node --test tests/scheduler.test.cjs`. Expected: all tests PASS.

## Task 4: Implement language-safe wordbook behavior

**Files:**
- Create: `src/utils/wordbook.cjs`
- Test: `tests/wordbook.test.cjs`

- [ ] **Step 1: Write failing normalization and switch tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeWord, switchWordbookLanguage, filterWordbook } = require('../src/utils/wordbook.cjs')

test('normalizes English and Korean within their own language', () => {
  assert.equal(normalizeWord('  Negligible  ', 'en'), 'negligible')
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
    { id: 'e', language: 'en', text: 'negligible', source: 'builtin' },
    { id: 'k', language: 'ko', text: '사과', source: 'custom' }
  ]
  const result = filterWordbook(words, {}, { language: 'ko', filter: 'all', query: '' })
  assert.deepEqual(result.map(word => word.id), ['k'])
})
```

- [ ] **Step 2: Run tests and verify failure**

Run `node --test tests/wordbook.test.cjs`. Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement normalization, switching and filters**

```js
function normalizeWord(text, language) {
  const normalized = text.trim().replace(/\s+/g, ' ').normalize('NFC')
  return language === 'en' ? normalized.toLowerCase() : normalized
}

function switchWordbookLanguage(view, language) {
  return { language, filter: view.filter, query: '' }
}

function filterWordbook(words, states, view) {
  const query = view.query.trim().toLocaleLowerCase()
  return words.filter(word => {
    if (word.language !== view.language) return false
    if (query && !`${word.text} ${word.definitionZh}`.toLocaleLowerCase().includes(query)) return false
    if (view.filter === 'custom') return word.source === 'custom'
    if (view.filter === 'mastered') return states[word.id]?.status === 'mastered'
    if (view.filter === 'learning') return states[word.id]?.status !== 'mastered'
    return true
  })
}

module.exports = { normalizeWord, switchWordbookLanguage, filterWordbook }
```

- [ ] **Step 4: Run tests and verify success**

Run `node --test tests/wordbook.test.cjs`. Expected: all tests PASS.

## Task 5: Add local repositories and settings

**Files:**
- Create: `src/services/storage.ts`
- Modify: `src/types/word.ts`

- [ ] **Step 1: Define versioned storage keys and defaults**

Use these exact keys: `vocab:v1:customWords`, `vocab:v1:studyStates`, `vocab:v1:daily`, `vocab:v1:settings`, `vocab:v1:session`, `vocab:v1:wordbookView`. Default settings are:

```ts
export const KEYS = {
  customWords: 'vocab:v1:customWords',
  studyStates: 'vocab:v1:studyStates',
  daily: 'vocab:v1:daily',
  settings: 'vocab:v1:settings',
  session: 'vocab:v1:session',
  wordbookView: 'vocab:v1:wordbookView'
} as const

export const DEFAULT_SETTINGS: Settings = {
  dailyTargets: { en: 30, ko: 30 },
  lastLearningLanguage: 'en'
}
```

- [ ] **Step 2: Implement typed storage repositories**

Use one checked read/write pair and expose the named repositories as thin wrappers:

```ts
import Taro from '@tarojs/taro'
import type { DailyProgress, SessionProgress, Settings, StudyState, Word, WordbookView } from '../types/word'

function read<T>(key: string, fallback: T, valid: (value: unknown) => boolean): T {
  const value = Taro.getStorageSync(key)
  if (!value) return JSON.parse(JSON.stringify(fallback)) as T
  if (!valid(value)) throw new Error(`本地数据格式无效：${key}`)
  return value as T
}

function write<T>(key: string, value: T): void {
  Taro.setStorageSync(key, value)
}

export const loadCustomWords = () => read<Word[]>(KEYS.customWords, [], Array.isArray)
export const saveCustomWords = (value: Word[]) => write(KEYS.customWords, value)
export const loadStudyStates = () => read<Record<string, StudyState>>(KEYS.studyStates, {}, value => typeof value === 'object' && value !== null && !Array.isArray(value))
export const saveStudyStates = (value: Record<string, StudyState>) => write(KEYS.studyStates, value)
export const loadSettings = () => read<Settings>(KEYS.settings, DEFAULT_SETTINGS, value => typeof value === 'object' && value !== null)
export const saveSettings = (value: Settings) => write(KEYS.settings, value)
export const loadSession = () => read<SessionProgress | null>(KEYS.session, null, value => value === null || typeof value === 'object')
export const saveSession = (value: SessionProgress) => write(KEYS.session, value)
export const clearSession = () => Taro.removeStorageSync(KEYS.session)
export const loadDailyRecords = () => read<Record<string, DailyProgress>>(KEYS.daily, {}, value => typeof value === 'object' && value !== null && !Array.isArray(value))
export const saveDailyRecords = (value: Record<string, DailyProgress>) => write(KEYS.daily, value)
export const loadWordbookView = () => read<WordbookView>(KEYS.wordbookView, { language: 'en', filter: 'all', query: '' }, value => typeof value === 'object' && value !== null)
export const saveWordbookView = (value: WordbookView) => write(KEYS.wordbookView, value)
```

Catch repository errors at page level, preserve the in-memory draft, and show the error through `Taro.showToast` or an inline error; never show a success message after a failed write.

- [ ] **Step 3: Persist word completion before advancing the UI**

Implement `completeWord({ word, rating, today, mode })` with this exact transition:

```ts
const session = loadSession()
if (!session || session.language !== word.language || session.date !== today || session.mode !== mode) {
  throw new Error('学习会话已失效，请重新生成今日任务')
}
const states = loadStudyStates()
const previous = states[word.id] || {
  wordId: word.id,
  language: word.language,
  stage: 0,
  nextDueDate: today,
  status: 'learning',
  history: []
}
const nextState = nextStudyState(previous, rating, today)
const dailyRecords = loadDailyRecords()
const dailyKey = `${today}:${word.language}`
const daily = dailyRecords[dailyKey] || {
  date: today,
  language: word.language,
  newTarget: loadSettings().dailyTargets[word.language],
  completedNewIds: [],
  completedReviewIds: []
}
const idField = mode === 'new' ? 'completedNewIds' : 'completedReviewIds'
const nextDaily = { ...daily, [idField]: [...new Set([...daily[idField], word.id])] }
const nextSession = {
  ...session,
  currentWordIndex: session.currentWordIndex + 1,
  currentStepId: 'word',
  completedAudioKeys: []
}
saveStudyStates({ ...states, [word.id]: nextState })
saveDailyRecords({ ...dailyRecords, [dailyKey]: nextDaily })
saveSession(nextSession)
return { nextState, nextDaily, nextSession }
```

Callers must update React state only after all three writes succeed. A write error leaves the completion buttons enabled after the error is shown so the user can retry; the UI must not optimistically advance to the next word.

## Task 6: Build the separated learning home and profile

**Files:**
- Create: `src/components/LanguageSwitch.tsx`
- Create: `src/pages/index/index.tsx`, `src/pages/index/index.css`, `src/pages/index/index.config.ts`
- Create: `src/pages/profile/index.tsx`, `src/pages/profile/index.css`, `src/pages/profile/index.config.ts`

- [ ] **Step 1: Implement the controlled language switch**

`LanguageSwitch` accepts `value: Language`, `onChange(language)`, and optional `labels`. It renders two Taro `Button` elements with stable classes `language-switch__option` and `language-switch__option--active`; it does not own global state, so wordbook switching cannot mutate the learning language.

- [ ] **Step 2: Build two independent dashboard cards**

On every `useDidShow`, load words, states, settings and same-day daily records. Build English and Korean summaries separately. Each card displays the language name, `completedNewIds.length/newTarget`, due review count, streak and a primary button. Start review when due reviews exist; otherwise start new words. Pass the selected language and mode in navigation parameters and reconstruct the queue from persisted data in the study page.

- [ ] **Step 3: Implement per-language streak calculation**

Count consecutive local calendar dates with at least one completed new or review ID for that language. English activity must not increment the Korean streak. Use `addDays` to walk backward from today; if today has no activity, start from yesterday so the previous streak remains visible.

- [ ] **Step 4: Implement settings and cache controls**

Profile uses two numeric steppers with minimum 1 and maximum 200. Saving updates only `dailyTargets[language]` and leaves completed IDs unchanged. Cache clearing removes downloaded media cache through Taro file APIs but never removes words, study states, daily records or settings; show a confirmation and the exact category being cleared.

## Task 7: Implement and test the study-flow audio gate

**Files:**
- Create: `src/utils/study-flow.cjs`
- Create: `src/services/audio.ts`
- Create: `src/components/AudioGate.tsx`
- Test: `tests/study-flow.test.cjs`

- [ ] **Step 1: Write failing flow tests**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { getSteps, canAdvance, completeAudio, interruptAudio } = require('../src/utils/study-flow.cjs')

test('English and Korean reveal definitions in confirmed order', () => {
  assert.deepEqual(getSteps('en').map(step => step.id), ['word', 'definitionZh', 'phrase', 'example'])
  assert.deepEqual(getSteps('ko').map(step => step.id), ['word', 'definitionKo', 'definitionZh', 'phrase', 'example'])
})

test('audio steps unlock only after matching completion', () => {
  const wordStep = getSteps('en')[0]
  assert.equal(canAdvance(wordStep, []), false)
  assert.equal(canAdvance(wordStep, ['word']), true)
  assert.equal(canAdvance(getSteps('en')[1], []), true)
})

test('interruption revokes completion and cannot unlock', () => {
  const completed = completeAudio([], 'word')
  assert.deepEqual(interruptAudio(completed, 'word'), [])
})
```

- [ ] **Step 2: Run tests and verify failure**

Run `node --test tests/study-flow.test.cjs`. Expected: FAIL because `study-flow.cjs` is missing.

- [ ] **Step 3: Implement flow transitions**

```js
const STEPS = {
  en: [
    { id: 'word', audioKey: 'word' },
    { id: 'definitionZh' },
    { id: 'phrase', audioKey: 'phrase' },
    { id: 'example', audioKey: 'example' }
  ],
  ko: [
    { id: 'word', audioKey: 'word' },
    { id: 'definitionKo' },
    { id: 'definitionZh' },
    { id: 'phrase', audioKey: 'phrase' },
    { id: 'example', audioKey: 'example' }
  ]
}

function getSteps(language) { return STEPS[language] }
function canAdvance(step, completedAudioKeys) {
  return !step.audioKey || completedAudioKeys.includes(step.audioKey)
}
function completeAudio(keys, audioKey) {
  return keys.includes(audioKey) ? keys : [...keys, audioKey]
}
function interruptAudio(keys, audioKey) {
  return keys.filter(key => key !== audioKey)
}
module.exports = { getSteps, canAdvance, completeAudio, interruptAudio }
```

- [ ] **Step 4: Run flow tests and verify success**

Run `node --test tests/study-flow.test.cjs`. Expected: all tests PASS.

- [ ] **Step 5: Implement one-current-audio playback**

`audio.ts` exports `playAudio(src): Promise<void>` and `stopAudio()`. It stops and destroys any previous `InnerAudioContext`, sets `autoplay = false`, attaches `onEnded` to resolve, attaches `onError` and unexpected `onStop` to reject, then calls `play()`. `stopAudio` rejects the pending play promise and destroys the context. No duration timer may resolve playback.

`AudioGate` exposes `src`, `audioKey`, `onCompleted(audioKey)`, and `onInterrupted(audioKey)`. It shows loading, playing, replay and failure states, but no slider, seek, skip or next button. Platform autoplay rejection produces a play button; successful `onEnded` is the only path to `onCompleted`.

## Task 8: Build the staged study page

**Files:**
- Create: `src/pages/study/index.tsx`, `src/pages/study/index.css`, `src/pages/study/index.config.ts`
- Modify: `src/services/storage.ts`

- [ ] **Step 1: Render only the current step**

Resolve the session language before selecting any word. For the current `Word`, render its image, text and pronunciation persistently. `word` shows `definitionEn`; `definitionKo` appears only for Korean; `definitionZh` shows Chinese; `phrase` and `example` show their text and Chinese translation. Never render future definitions in hidden DOM that could be inspected as a workaround.

- [ ] **Step 2: Wire audio events to navigation state**

Entering an audio step removes its previous completion key and starts playback. `onCompleted` adds the key and enables the primary button. `onInterrupted`, page hide and page unload remove the key and disable it. Replay removes the key before restarting. Non-audio steps have an enabled continue button. Disable double-clicks while a completion write is in progress.

- [ ] **Step 3: Save mastery and advance without double counting**

After the final example, show `认识`, `模糊`, `不认识`. Each calls `completeWord` once with the session mode, updates UI from the saved session, and either advances or shows the language-specific completion summary. If the user exits, the same session resumes at the saved word and step with all current audio revoked. If the date changed, clear the old session and rebuild the queue.

- [ ] **Step 4: Handle missing media explicitly**

Image failure renders a styled text fallback and a retry control without blocking audio. Audio failure leaves the primary button disabled and offers retry. A word with `contentStatus !== 'ready'` is skipped during queue construction and reported in the completion summary as unavailable, never counted as learned.

## Task 9: Implement wordbook, editing and secure generation

**Files:**
- Create: `src/pages/wordbook/index.tsx`, `src/pages/wordbook/index.css`, `src/pages/wordbook/index.config.ts`
- Create: `src/pages/word-edit/index.tsx`, `src/pages/word-edit/index.css`, `src/pages/word-edit/index.config.ts`
- Create: `src/services/generator.ts`
- Create: `cloud/generate-word/index.js`
- Create: `cloud/generate-word/providers.js`
- Create: `cloud/generate-word/validate.js`
- Create: `cloud/generate-word/package.json`
- Test: `tests/wordbook.test.cjs`

- [ ] **Step 1: Build wordbook language, filter and search views**

Initialize the view from `loadWordbookView`; when navigation includes a learning language, use it only for initial display. Manual switching calls `switchWordbookLanguage`, saves the new view and never writes `lastLearningLanguage`. Show per-language counts and the correct empty state. Add/edit/delete/restart operations reload the current list while retaining language and filter.

- [ ] **Step 2: Implement editable generation drafts**

The add page receives the current language. It keeps a draft with all `Word` fields and `contentStatus: 'generating'`. Generate calls `POST /generate-word` with:

```json
{
  "language": "en",
  "word": "negligible"
}
```

The client requires this response shape before enabling save:

```json
{
  "word": {
    "text": "negligible",
    "pronunciation": "/nˈeɡlɪdʒəbəl/",
    "definitionEn": "so small or unimportant that it is almost nothing",
    "definitionZh": "微不足道的；可忽略不计的",
    "definitionKo": "",
    "imageUrl": "https://cdn.example.com/negligible.png",
    "wordAudioUrl": "https://cdn.example.com/negligible-word.mp3",
    "phrase": { "text": "a negligible amount", "translationZh": "微不足道的数量", "audioUrl": "https://cdn.example.com/negligible-phrase.mp3" },
    "example": { "text": "The damage was negligible.", "translationZh": "损失微不足道。", "audioUrl": "https://cdn.example.com/negligible-example.mp3" }
  }
}
```

The Korean response additionally requires non-empty `definitionKo`. Every text field is editable. Editing word, phrase or example text invalidates its old audio URL and requires regeneration of that audio before saving. Save validates all required fields, normalizes for duplicate detection within the language, writes a custom `Word`, initializes no study state, and returns to the same wordbook view.

- [ ] **Step 3: Implement explicit generation failures**

`generator.ts` reads a cloud base URL from environment configuration, uses `Taro.request`, rejects non-2xx responses, validates the DTO and preserves the draft on failure. With no configured endpoint it displays “生词云服务尚未配置，请完成云端配置后重试”; it must not invent definitions or insert incomplete words. Timeout and duplicate submissions are disabled while a request is pending.

- [ ] **Step 4: Implement the reference WeChat CloudBase handler**

Use `wx-server-sdk` and Node 18 `fetch`. `package.json` declares only `wx-server-sdk`; dependency installation and deployment are not run until the user authorizes cloud deployment. Configure `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, and optional `OPENAI_BASE_URL` only in the cloud environment.

`providers.js` implements these exact provider operations:

```js
const cloud = require('wx-server-sdk')
const { randomUUID } = require('node:crypto')
const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

async function api(path, body, binary = false) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`Provider ${response.status}: ${await response.text()}`)
  return binary ? response.arrayBuffer() : response.json()
}

async function generateText(language, word) {
  const result = await api('/chat/completions', {
    model: process.env.OPENAI_TEXT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Return JSON with pronunciation, definitionEn, definitionKo, definitionZh, phrase{text,translationZh}, example{text,translationZh}. definitionEn must be concise English; definitionKo is natural Korean only for ko and empty for en; use Simplified Chinese and one useful IELTS/TOPIK phrase and one grammatical example.' },
      { role: 'user', content: JSON.stringify({ language, word }) }
    ]
  })
  return JSON.parse(result.choices[0].message.content)
}

async function upload(buffer, extension) {
  const cloudPath = `generated/${randomUUID()}.${extension}`
  const { fileID } = await cloud.uploadFile({ cloudPath, fileContent: Buffer.from(buffer) })
  const result = await cloud.getTempFileURL({ fileList: [fileID] })
  if (result.fileList[0].status !== 0) throw new Error('Media URL creation failed')
  return result.fileList[0].tempFileURL
}

async function generateImage(language, word) {
  const result = await api('/images/generations', {
    model: process.env.OPENAI_IMAGE_MODEL,
    prompt: `A clear editorial illustration representing the ${language === 'ko' ? 'Korean' : 'English'} word ${word}, no letters, no words, no watermark`,
    response_format: 'b64_json'
  })
  return upload(Buffer.from(result.data[0].b64_json, 'base64'), 'png')
}

async function generateSpeech(text, language) {
  const audio = await api('/audio/speech', {
    model: process.env.OPENAI_TTS_MODEL,
    voice: process.env.OPENAI_TTS_VOICE,
    input: text,
    instructions: language === 'ko' ? 'Speak natural standard Korean clearly at a learning-friendly pace.' : 'Speak clear standard English at a learning-friendly pace.'
  }, true)
  return upload(audio, 'mp3')
}

module.exports = { generateText, generateImage, generateSpeech }
```

`index.js` initializes CloudBase once, accepts only `language` of `en`/`ko` and a trimmed word of 1–100 characters, calls `generateText`, validates its text DTO, then generates one image and three speech files. It returns the exact client DTO from Step 2 and a 400 error for invalid input or a 502 error for provider/validation failure. `validate.js` rejects missing strings, wrong language content, unknown extra media values, and Korean entries without `definitionKo`. No API key, raw provider response or persistent base64 payload is returned to the client.

- [ ] **Step 5: Run all domain tests**

Run:

```powershell
node --test tests/scheduler.test.cjs tests/wordbook.test.cjs tests/study-flow.test.cjs
```

Expected: all tests PASS, including the language isolation cases after wordbook integration.

## Task 10: Finish styling, preview and verification

**Files:**
- Modify: all page CSS files
- Modify: `src/app.css`
- Modify only if diagnostics require it: affected source files

- [ ] **Step 1: Apply a consistent learning-focused visual system**

Use warm off-white backgrounds, deep green primary actions, coral accents for review counts, large readable word typography, rounded media with fixed aspect ratio, and a persistent bottom action area on study screens. Ensure disabled controls are visually distinct, Korean and English text wrap without clipping, and touch targets are at least 44px. Do not use browser-only elements, inline SVG, placeholder imagery or network tabBar icons.

- [ ] **Step 2: Refresh preview through the required Taro script**

Run in background:

```powershell
node "${skill_assets_dir}/scripts/preview-server.js"
```

Expected: output containing `[TraePreviewUrl]: <url>`. Use the available preview opening mechanism for that URL; if `OpenPreview` is unavailable, report that limitation and use miniapp-builder workbench rather than inventing a tool.

- [ ] **Step 3: Open the current miniapp workbench**

Call `status(projectRoot)`. If no preview port exists, call `control(action: "start")`; then immediately call `workbench(projectRoot)` once. Only `state: "ready"` means H5 compilation succeeded. Do not poll in a sleep loop and do not claim WeChat device verification from an H5 result.

- [ ] **Step 4: Inspect failures and rerun domain checks**

If compilation fails, read `inspect(source: "compile")` and fix the identified source issue. If runtime or network errors appear in the workbench, read the matching log with its session when supplied. After every source change, refresh the required preview script. Re-run the three Node test files after domain changes.

- [ ] **Step 5: Verify the accepted behavior manually in the workbench**

Check English and Korean cards independently; complete at least one new word and one review; verify future definitions are absent until their steps; confirm next remains disabled during audio; replay and interrupt audio; exit and resume; switch wordbook languages without changing learning language; add a duplicate; verify generation failure preserves the draft; change each daily target independently; confirm D60 mastery with domain tests. Do not run a local WeChat build or upload unless the user explicitly requests it.

## Completion Evidence

The implementation is complete only when:

- All three Node test suites pass.
- The current workbench card has been provided and H5 state is `ready`, or any remaining compile/runtime error is reported verbatim with its stage.
- English and Korean sessions cannot mix.
- Every audio step is gated by actual completion events.
- Wordbook language switching, daily targets and scheduling match the approved spec.
- Cloud generation is either genuinely connected and validated or clearly reported as awaiting user credentials; no mock generation is represented as production AI output.
- Seed media are real generated assets and all user-visible claims match what has actually been verified.
