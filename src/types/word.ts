export type Language = 'en' | 'ko'
export type Rating = 'known' | 'fuzzy' | 'unknown'
export type ContentStatus = 'generating' | 'incomplete' | 'ready'
export type StudyMode = 'review' | 'new'
export type WordbookFilter = 'all' | 'learning' | 'mastered' | 'custom'

export interface WordSourceRef {
  name: string
  sourceId: string
  license: string
}

export interface Word {
  id: string
  language: Language
  text: string
  normalizedText: string
  pronunciation: string
  definitionEn: string
  definitionKo?: string
  definitionZh: string
  imageUrl?: string
  wordAudioUrl: string
  phrase: { text: string; translationZh: string; audioUrl: string }
  example: { text: string; translationZh: string; audioUrl: string }
  source: 'builtin' | 'custom'
  contentStatus: ContentStatus
  senseId?: string
  level?: number | null
  advanced?: boolean
  priority?: number
  partOfSpeech?: string
  sources?: WordSourceRef[]
}

export interface WordIndexEntry {
  id: string
  language: Language
  text: string
  normalizedText: string
  definitionZh: string
  source: 'builtin' | 'custom'
  contentStatus: ContentStatus
  level?: number | null
  advanced?: boolean
  priority?: number
  sources?: WordSourceRef[]
  chunkFile?: string
}

export interface VocabularyManifest {
  schemaVersion: 1
  chunkSize: number
  legacyIds: string[]
  languages: Record<Language, {
    count: number
    indexFile: string
    chunkFiles: string[]
  }>
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
  mode: StudyMode
}

export interface Settings {
  dailyTargets: Record<Language, number>
  lastLearningLanguage: Language
}

export interface WordbookView {
  language: Language
  filter: WordbookFilter
  query: string
}

export interface GeneratedWord {
  text: string
  pronunciation: string
  definitionEn: string
  definitionKo: string
  definitionZh: string
  imageUrl: string
  wordAudioUrl: string
  phrase: { text: string; translationZh: string; audioUrl: string }
  example: { text: string; translationZh: string; audioUrl: string }
}

export interface GenerateWordResponse {
  word: GeneratedWord
}
