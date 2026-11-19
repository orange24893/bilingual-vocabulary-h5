import Taro from '@tarojs/taro'
import type { GeneratedWord, Language } from '../types/word'

const UNAVAILABLE_MESSAGE = '生词云服务尚未配置，请完成云端配置后重试'
const BASE_URL = (process.env.TARO_APP_VOCAB_API_BASE || '').replace(/\/$/, '')

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`云服务返回内容缺少 ${field}`)
  return value
}

function requireMedia(value: unknown, field: string): string {
  const url = requireText(value, field)
  if (!url.startsWith('https://')) throw new Error(`云服务返回的 ${field} 不是有效 HTTPS 地址`)
  return url
}

function validateGeneratedWord(value: unknown, language: Language): GeneratedWord {
  if (!value || typeof value !== 'object') throw new Error('云服务返回格式无效')
  const word = value as Record<string, unknown>
  const phrase = word.phrase as Record<string, unknown>
  const example = word.example as Record<string, unknown>
  if (!phrase || typeof phrase !== 'object' || !example || typeof example !== 'object') {
    throw new Error('云服务返回的短语或例句格式无效')
  }
  return {
    text: requireText(word.text, '单词'),
    pronunciation: requireText(word.pronunciation, '发音标注'),
    definitionEn: requireText(word.definitionEn, '英文释义'),
    definitionKo: language === 'ko' ? requireText(word.definitionKo, '韩文释义') : '',
    definitionZh: requireText(word.definitionZh, '中文释义'),
    imageUrl: requireMedia(word.imageUrl, '配图'),
    wordAudioUrl: requireMedia(word.wordAudioUrl, '单词音频'),
    phrase: {
      text: requireText(phrase.text, '短语'),
      translationZh: requireText(phrase.translationZh, '短语翻译'),
      audioUrl: requireMedia(phrase.audioUrl, '短语音频')
    },
    example: {
      text: requireText(example.text, '例句'),
      translationZh: requireText(example.translationZh, '例句翻译'),
      audioUrl: requireMedia(example.audioUrl, '例句音频')
    }
  }
}

async function post(body: Record<string, unknown>): Promise<unknown> {
  if (!BASE_URL) throw new Error(UNAVAILABLE_MESSAGE)
  const response = await Taro.request<unknown>({
    url: `${BASE_URL}/generate-word`,
    method: 'POST',
    timeout: 120000,
    header: { 'Content-Type': 'application/json' },
    data: body
  })
  let payload: any = response.data
  if (payload && typeof payload.body === 'string') {
    try {
      payload = JSON.parse(payload.body)
    } catch {
      throw new Error('云服务返回了无法解析的内容')
    }
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(payload?.error || `云服务请求失败（${response.statusCode}）`)
  }
  if (payload?.error) throw new Error(payload.error)
  return payload
}

export async function generateWord(language: Language, text: string): Promise<GeneratedWord> {
  const payload = await post({ language, word: text.trim() }) as { word?: unknown }
  return validateGeneratedWord(payload?.word, language)
}

export async function regenerateImage(language: Language, text: string): Promise<string> {
  const payload = await post({ operation: 'image', language, word: text.trim() }) as { imageUrl?: unknown }
  return requireMedia(payload?.imageUrl, '配图')
}

export async function regenerateSpeech(language: Language, text: string): Promise<string> {
  const payload = await post({ operation: 'speech', language, word: text.trim() }) as { audioUrl?: unknown }
  return requireMedia(payload?.audioUrl, '音频')
}
