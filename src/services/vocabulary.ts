import { SEED_WORDS as LEGACY_WORDS } from '../data/seed'
import type { Language, VocabularyManifest, Word, WordIndexEntry } from '../types/word'
import { normalizeWord } from '../utils/wordbook.cjs'
import { sortIndexEntries } from '../utils/vocabulary.cjs'
import { loadCustomWords } from './storage'

const ROOT = '/static/vocabulary/data'
const indexCache = new Map<Language, Promise<WordIndexEntry[]>>()
const chunkCache = new Map<string, Promise<Word[]>>()
let manifestPromise: Promise<VocabularyManifest> | undefined

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${ROOT}/${path}`, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`词库文件读取失败（${response.status}）：${path}`)
  try {
    return await response.json() as T
  } catch {
    throw new Error(`词库文件格式错误：${path}`)
  }
}

export function loadManifest(): Promise<VocabularyManifest> {
  if (!manifestPromise) manifestPromise = fetchJson<VocabularyManifest>('manifest.json')
  return manifestPromise
}

export function loadBuiltinIndex(language: Language): Promise<WordIndexEntry[]> {
  let current = indexCache.get(language)
  if (!current) {
    current = loadManifest().then(async manifest => {
      const entries = await fetchJson<WordIndexEntry[]>(manifest.languages[language].indexFile)
      return sortIndexEntries(entries)
    })
    indexCache.set(language, current)
  }
  return current
}

function toIndexEntry(word: Word): WordIndexEntry {
  return {
    id: word.id,
    language: word.language,
    text: word.text,
    normalizedText: word.normalizedText,
    definitionZh: word.definitionZh,
    source: word.source,
    contentStatus: word.contentStatus,
    level: word.level,
    advanced: word.advanced,
    priority: word.priority ?? 999999999,
    sources: word.sources
  }
}

export async function loadIndexEntries(language: Language): Promise<WordIndexEntry[]> {
  const builtin = await loadBuiltinIndex(language)
  const legacy = LEGACY_WORDS.filter(word => word.language === language).map(toIndexEntry)
  const custom = loadCustomWords().filter(word => word.language === language).map(toIndexEntry)
  return sortIndexEntries([...builtin, ...legacy, ...custom])
}

function loadChunk(chunkFile: string): Promise<Word[]> {
  let current = chunkCache.get(chunkFile)
  if (!current) {
    current = fetchJson<Word[]>(chunkFile)
    chunkCache.set(chunkFile, current)
  }
  return current
}

export async function loadWord(id: string): Promise<Word | undefined> {
  const local = loadCustomWords().find(word => word.id === id) || LEGACY_WORDS.find(word => word.id === id)
  if (local) return local
  for (const language of ['en', 'ko'] as const) {
    const entry = (await loadBuiltinIndex(language)).find(item => item.id === id)
    if (!entry) continue
    if (!entry.chunkFile) throw new Error(`词条缺少分片地址：${id}`)
    const word = (await loadChunk(entry.chunkFile)).find(item => item.id === id)
    if (!word) throw new Error(`词条不在声明的分片中：${id}`)
    if (word.language !== entry.language) throw new Error(`词条语言与索引不一致：${id}`)
    return word
  }
  return undefined
}

export function resetVocabularyCache(): void {
  manifestPromise = undefined
  indexCache.clear()
  chunkCache.clear()
}

export async function findDuplicate(
  language: Language,
  normalizedText: string,
  excludeId = ''
): Promise<WordIndexEntry | undefined> {
  const entries = await loadIndexEntries(language)
  const normalized = normalizeWord(normalizedText, language)
  return entries.find(entry => entry.id !== excludeId && entry.normalizedText === normalized)
}
