import { useState } from 'react'
import { Button, Image, Input, ScrollView, Text, Textarea, View } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import LanguageSwitch from '../../components/LanguageSwitch'
import { generateWord, regenerateImage, regenerateSpeech } from '../../services/generator'
import {
  loadCustomWords,
  saveCustomWords,
  saveOpenWordId,
  saveWordbookView,
  loadWordbookView
} from '../../services/storage'
import { findDuplicate, loadWord } from '../../services/vocabulary'
import type { Language, Word } from '../../types/word'
import { normalizeWord } from '../../utils/wordbook.cjs'
import styles from './index.module.scss'

function emptyDraft(language: Language): Word {
  return {
    id: '',
    language,
    text: '',
    normalizedText: '',
    pronunciation: '',
    definitionEn: '',
    definitionKo: '',
    definitionZh: '',
    imageUrl: '',
    wordAudioUrl: '',
    phrase: { text: '', translationZh: '', audioUrl: '' },
    example: { text: '', translationZh: '', audioUrl: '' },
    source: 'custom',
    contentStatus: 'generating'
  }
}

export default function WordEdit() {
  const router = useRouter()
  const editingId = router.params.id || ''
  const initialLanguage: Language = router.params.language === 'ko' ? 'ko' : 'en'
  const [draft, setDraft] = useState<Word>(() => emptyDraft(initialLanguage))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useLoad(() => {
    if (editingId) {
      const existing = loadCustomWords().find(word => word.id === editingId)
      if (existing) setDraft(existing)
      else setError('未找到该自定义词条，可能已被删除')
    } else {
      const view = loadWordbookView()
      const language = router.params.language === 'ko' || router.params.language === 'en' ? router.params.language : view.language
      setDraft(emptyDraft(language))
    }
    setLoaded(true)
  })

  const patch = (value: Partial<Word>) => {
    setDraft(current => ({ ...current, ...value, contentStatus: 'incomplete' }))
    setError('')
  }

  const changeLanguage = (language: Language) => {
    if (editingId || busy) return
    setDraft(emptyDraft(language))
  }

  const run = async (name: string, action: () => Promise<void>) => {
    if (busy) return
    setBusy(name)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试')
    } finally {
      setBusy('')
    }
  }

  const generate = () => run('generate', async () => {
    if (!draft.text.trim()) throw new Error('请先输入要生成的单词')
    const generated = await generateWord(draft.language, draft.text)
    setDraft(current => ({
      ...current,
      ...generated,
      language: current.language,
      normalizedText: normalizeWord(generated.text, current.language),
      source: 'custom',
      contentStatus: 'ready'
    }))
    Taro.showToast({ title: '内容已生成，可继续编辑', icon: 'none' })
  })

  const updateWordText = (text: string) => patch({ text, wordAudioUrl: '' })
  const updatePhraseText = (text: string) => patch({ phrase: { ...draft.phrase, text, audioUrl: '' } })
  const updateExampleText = (text: string) => patch({ example: { ...draft.example, text, audioUrl: '' } })

  const refreshImage = () => run('image', async () => {
    if (!draft.text.trim()) throw new Error('请先填写单词')
    const imageUrl = await regenerateImage(draft.language, draft.text)
    patch({ imageUrl })
  })

  const refreshSpeech = (kind: 'word' | 'phrase' | 'example') => run(`${kind}Audio`, async () => {
    const text = kind === 'word' ? draft.text : kind === 'phrase' ? draft.phrase.text : draft.example.text
    if (!text.trim()) throw new Error('请先填写对应文本')
    const audioUrl = await regenerateSpeech(draft.language, text)
    if (kind === 'word') patch({ wordAudioUrl: audioUrl })
    if (kind === 'phrase') patch({ phrase: { ...draft.phrase, audioUrl } })
    if (kind === 'example') patch({ example: { ...draft.example, audioUrl } })
  })

  const validate = () => {
    const required = [
      draft.text, draft.pronunciation, draft.definitionEn, draft.definitionZh,
      draft.phrase.text, draft.phrase.translationZh, draft.example.text, draft.example.translationZh
    ]
    if (draft.language === 'ko') required.push(draft.definitionKo || '')
    if (required.some(value => !value.trim())) throw new Error('请完整填写所有释义、短语、例句及翻译')
    if (!draft.wordAudioUrl) throw new Error('单词文本已修改或音频缺失，请重新生成单词音频')
    if (!draft.phrase.audioUrl) throw new Error('短语文本已修改或音频缺失，请重新生成短语音频')
    if (!draft.example.audioUrl) throw new Error('例句文本已修改或音频缺失，请重新生成例句音频')
  }

  const openDuplicate = async (word: Word) => {
    const result = await Taro.showModal({
      title: '单词已存在',
      content: `当前语言中已有“${word.text}”，无需重复添加。`,
      confirmText: '打开词条'
    })
    if (!result.confirm) return
    const view = loadWordbookView()
    saveWordbookView({ ...view, language: word.language, query: '' })
    saveOpenWordId(word.id)
    Taro.switchTab({ url: '/pages/wordbook/index' })
  }

  const save = async () => {
    if (busy) return
    try {
      validate()
      const normalizedText = normalizeWord(draft.text, draft.language)
      const duplicate = await findDuplicate(draft.language, normalizedText, draft.id)
      if (duplicate) {
        const fullDuplicate = await loadWord(duplicate.id)
        if (fullDuplicate) {
          await openDuplicate(fullDuplicate)
          return
        }
      }
      const id = draft.id || `custom-${draft.language}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const nextWord: Word = { ...draft, id, text: draft.text.trim(), normalizedText, source: 'custom', contentStatus: 'ready' }
      const customWords = loadCustomWords()
      const index = customWords.findIndex(word => word.id === id)
      if (index >= 0) customWords[index] = nextWord
      else customWords.push(nextWord)
      saveCustomWords(customWords)
      await Taro.showToast({ title: '已保存', icon: 'success' })
      Taro.navigateBack()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    }
  }

  const mediaButton = (kind: 'word' | 'phrase' | 'example', url: string) => (
    <Button className={styles.mediaButton} disabled={Boolean(busy)} onClick={() => refreshSpeech(kind)}>
      {busy === `${kind}Audio` ? '正在生成音频' : url ? '重新生成音频' : '生成对应音频'}
    </Button>
  )

  return (
    <ScrollView scrollY className={styles.container} enhanced showScrollbar={false}>
      <View className={styles.header}>
        <Text className={styles.eyebrow}>EDITABLE AI DRAFT</Text>
        <Text className={styles.title}>{editingId ? '编辑生词' : '添加生词'}</Text>
        <Text className={styles.subtitle}>生成结果只是草稿。保存前可修改所有文字，并重新生成受影响的音频。</Text>
      </View>
      {!editingId && <LanguageSwitch value={draft.language} onChange={changeLanguage} />}
      {error && <View className={styles.errorBanner}><Text>{error}</Text></View>}

      <View className={styles.formCard}>
        <View className={styles.field}>
          <Text className={styles.label}>单词 / 表达</Text>
          <Input className={styles.wordInput} value={draft.text} maxlength={100} placeholder={draft.language === 'en' ? '例如：negligible' : '例如：약속'} onInput={event => updateWordText(event.detail.value)} />
          {mediaButton('word', draft.wordAudioUrl)}
        </View>
        {!editingId && <Button className={styles.generateButton} disabled={Boolean(busy) || !draft.text.trim()} onClick={generate}>{busy === 'generate' ? '正在生成文字、配图与音频' : '生成完整词条草稿'}</Button>}
        <View className={styles.divider} />

        <View className={styles.field}>
          <Text className={styles.label}>发音标注</Text>
          <Input className={styles.input} value={draft.pronunciation} placeholder="音标或韩语发音提示" onInput={event => patch({ pronunciation: event.detail.value })} />
        </View>
        <View className={styles.field}>
          <Text className={styles.label}>英文释义</Text>
          <Textarea className={styles.textarea} value={draft.definitionEn} maxlength={1000} onInput={event => patch({ definitionEn: event.detail.value })} />
        </View>
        {draft.language === 'ko' && (
          <View className={styles.field}>
            <Text className={styles.label}>韩文释义</Text>
            <Textarea className={styles.textarea} value={draft.definitionKo} maxlength={1000} onInput={event => patch({ definitionKo: event.detail.value })} />
          </View>
        )}
        <View className={styles.field}>
          <Text className={styles.label}>中文释义</Text>
          <Textarea className={styles.textarea} value={draft.definitionZh} maxlength={1000} onInput={event => patch({ definitionZh: event.detail.value })} />
        </View>
      </View>

      <View className={styles.formCard}>
        <Text className={styles.sectionTitle}>配图（可选）</Text>
        {draft.imageUrl ? <Image className={styles.previewImage} src={draft.imageUrl} mode="aspectFill" /> : <View className={styles.imagePlaceholder}><Text>{draft.text || '文字卡片'} · 无需配图也可保存</Text></View>}
        <Button className={styles.mediaButton} disabled={Boolean(busy) || !draft.text.trim()} onClick={refreshImage}>{busy === 'image' ? '正在生成配图' : draft.imageUrl ? '重新生成配图' : '生成配图'}</Button>
      </View>

      <View className={styles.formCard}>
        <Text className={styles.sectionTitle}>常用短语</Text>
        <View className={styles.field}>
          <Text className={styles.label}>短语原文</Text>
          <Textarea className={styles.textarea} value={draft.phrase.text} maxlength={1000} onInput={event => updatePhraseText(event.detail.value)} />
          {mediaButton('phrase', draft.phrase.audioUrl)}
        </View>
        <View className={styles.field}>
          <Text className={styles.label}>中文翻译</Text>
          <Textarea className={styles.textarea} value={draft.phrase.translationZh} maxlength={1000} onInput={event => patch({ phrase: { ...draft.phrase, translationZh: event.detail.value } })} />
        </View>
      </View>

      <View className={styles.formCard}>
        <Text className={styles.sectionTitle}>例句</Text>
        <View className={styles.field}>
          <Text className={styles.label}>例句原文</Text>
          <Textarea className={styles.textareaLarge} value={draft.example.text} maxlength={2000} onInput={event => updateExampleText(event.detail.value)} />
          {mediaButton('example', draft.example.audioUrl)}
        </View>
        <View className={styles.field}>
          <Text className={styles.label}>中文翻译</Text>
          <Textarea className={styles.textarea} value={draft.example.translationZh} maxlength={1000} onInput={event => patch({ example: { ...draft.example, translationZh: event.detail.value } })} />
        </View>
      </View>

      <View className={styles.saveBar}>
        <Text className={styles.saveHint}>三段音频齐全后才能保存；配图为可选内容。</Text>
        <Button className={styles.saveButton} disabled={Boolean(busy) || !loaded} onClick={save}>保存到生词本</Button>
      </View>
    </ScrollView>
  )
}
