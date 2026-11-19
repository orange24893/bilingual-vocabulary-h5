import Taro from '@tarojs/taro'
import type { DailyProgress, Rating, SessionProgress, Settings, StudyMode, StudyState, Word, WordbookView } from '../types/word'
import { nextStudyState } from '../utils/scheduler.cjs'

export const KEYS = {
  customWords: 'vocab:v1:customWords',
  studyStates: 'vocab:v1:studyStates',
  daily: 'vocab:v1:daily',
  settings: 'vocab:v1:settings',
  session: 'vocab:v1:session',
  wordbookView: 'vocab:v1:wordbookView',
  wordbookOpenId: 'vocab:v1:wordbookOpenId'
} as const

export const DEFAULT_SETTINGS: Settings = {
  dailyTargets: { en: 30, ko: 30 },
  lastLearningLanguage: 'en'
}

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
export const loadWordbookView = () => read<WordbookView>(KEYS.wordbookView, { language: loadSettings().lastLearningLanguage, filter: 'all', query: '' }, value => typeof value === 'object' && value !== null)
export const saveWordbookView = (value: WordbookView) => write(KEYS.wordbookView, value)
export const saveOpenWordId = (id: string) => write(KEYS.wordbookOpenId, id)
export const consumeOpenWordId = (): string => {
  const value = Taro.getStorageSync(KEYS.wordbookOpenId)
  Taro.removeStorageSync(KEYS.wordbookOpenId)
  return typeof value === 'string' ? value : ''
}

interface CompleteWordInput {
  word: Word
  rating: Rating
  today: string
  mode: StudyMode
}

export function completeWord({ word, rating, today, mode }: CompleteWordInput) {
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
    status: 'learning' as const,
    history: []
  }
  const nextState = nextStudyState(previous, rating, today) as StudyState
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
}

