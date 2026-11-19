import { useRef, useState } from 'react'
import { Button, Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import AudioGate from '../../components/AudioGate'
import LanguageSwitch from '../../components/LanguageSwitch'
import { stopAudio } from '../../services/audio'
import {
  clearSession,
  consumeOpenWordId,
  loadCustomWords,
  loadSession,
  loadStudyStates,
  loadWordbookView,
  saveCustomWords,
  saveStudyStates,
  saveWordbookView
} from '../../services/storage'
import { loadIndexEntries, loadWord, resetVocabularyCache } from '../../services/vocabulary'
import type { Language, StudyState, Word, WordbookFilter, WordbookView, WordIndexEntry } from '../../types/word'
import { filterWordbook, switchWordbookLanguage } from '../../utils/wordbook.cjs'
import { paginate } from '../../utils/vocabulary.cjs'
import styles from './index.module.scss'

const FILTERS: Array<{ id: WordbookFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'learning', label: '学习中' },
  { id: 'mastered', label: '已掌握' },
  { id: 'custom', label: '我的生词' }
]

function libraryLabel(word: Pick<WordIndexEntry, 'language' | 'level' | 'advanced' | 'source'>): string {
  if (word.source === 'custom') return '我的生词'
  if (word.language === 'en') return 'IELTS 推荐备考词库'
  return word.level
    ? `TOPIK 分级参考 ${word.level} 级${word.advanced ? ' · 高级重点' : ''}`
    : 'TOPIK 推荐备考词库'
}

function sourceNames(word: Pick<WordIndexEntry, 'sources'>): string {
  return word.sources?.map(source => source.name).join(' / ') || '我的生词'
}

export default function Wordbook() {
  const [view, setView] = useState<WordbookView>({ language: 'en', filter: 'all', query: '' })
  const [entries, setEntries] = useState<WordIndexEntry[]>([])
  const [states, setStates] = useState<Record<string, StudyState>>({})
  const [selectedId, setSelectedId] = useState('')
  const [selectedWord, setSelectedWord] = useState<Word | null>(null)
  const [audio, setAudio] = useState({ key: '', src: '' })
  const [page, setPage] = useState(1)
  const [listLoading, setListLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const entriesRequest = useRef(0)
  const detailRequest = useRef(0)

  const closeDetail = () => {
    detailRequest.current += 1
    setSelectedId('')
    setSelectedWord(null)
    setDetailLoading(false)
    setAudio({ key: '', src: '' })
    stopAudio()
  }

  const refreshEntries = async (language: Language, resetCache = false) => {
    const requestId = ++entriesRequest.current
    if (resetCache) resetVocabularyCache()
    setListLoading(true)
    try {
      const nextEntries = await loadIndexEntries(language)
      if (entriesRequest.current !== requestId) return
      setEntries(nextEntries)
      setError('')
    } catch (cause) {
      if (entriesRequest.current === requestId) {
        setError(cause instanceof Error ? cause.message : '生词本读取失败')
      }
    } finally {
      if (entriesRequest.current === requestId) setListLoading(false)
    }
  }

  const openWordById = async (id: string, resetCache = false) => {
    const requestId = ++detailRequest.current
    if (resetCache) resetVocabularyCache()
    setSelectedId(id)
    setSelectedWord(null)
    setDetailLoading(true)
    setAudio({ key: '', src: '' })
    stopAudio()
    setError('')
    try {
      const word = await loadWord(id)
      if (detailRequest.current !== requestId) return
      if (!word) throw new Error('词条不存在或已被删除')
      setSelectedWord(word)
      setAudio({ key: `${word.id}:word`, src: word.wordAudioUrl })
    } catch (cause) {
      if (detailRequest.current === requestId) {
        setError(cause instanceof Error ? `词条读取失败：${cause.message}` : '词条读取失败')
      }
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false)
    }
  }

  useDidShow(() => {
    void (async () => {
      try {
        const nextView = loadWordbookView()
        closeDetail()
        setView(nextView)
        setPage(1)
        setStates(loadStudyStates())
        await refreshEntries(nextView.language)
        const openId = consumeOpenWordId()
        if (openId) await openWordById(openId)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '生词本读取失败')
      }
    })()
  })

  useDidHide(() => stopAudio())

  const updateView = (next: WordbookView) => {
    try {
      saveWordbookView(next)
      setView(next)
      setPage(1)
      closeDetail()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '视图设置保存失败')
    }
  }

  const changeLanguage = (language: Language) => {
    updateView(switchWordbookLanguage(view, language))
    void refreshEntries(language)
  }

  const filteredEntries = filterWordbook(entries, states, view) as WordIndexEntry[]
  const visiblePage = paginate(filteredEntries, page, 50)

  const openWord = (entry: WordIndexEntry) => {
    void openWordById(entry.id)
  }

  const deleteWord = async (word: Word) => {
    const result = await Taro.showModal({
      title: '删除生词',
      content: `确定删除“${word.text}”吗？该词条的学习状态也会删除，其他学习记录不受影响。`,
      confirmText: '删除',
      confirmColor: '#b8483d'
    })
    if (!result.confirm) return
    try {
      saveCustomWords(loadCustomWords().filter(item => item.id !== word.id))
      const nextStates = loadStudyStates()
      delete nextStates[word.id]
      saveStudyStates(nextStates)
      if (loadSession()?.wordIds.includes(word.id)) clearSession()
      setStates(nextStates)
      closeDetail()
      await refreshEntries(word.language)
      Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除失败')
    }
  }

  const relearn = (word: Word) => {
    try {
      const nextStates = loadStudyStates()
      delete nextStates[word.id]
      saveStudyStates(nextStates)
      setStates(nextStates)
      closeDetail()
      Taro.showToast({ title: '已重新加入学习队列', icon: 'none' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    }
  }

  const selectAudio = (key: string, src: string) => setAudio({ key, src })

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View>
          <Text className={styles.eyebrow}>WORD COLLECTION</Text>
          <Text className={styles.title}>生词本</Text>
        </View>
        <Button className={styles.addButton} onClick={() => Taro.navigateTo({ url: `/pages/word-edit/index?language=${view.language}` })}>添加生词</Button>
      </View>
      <LanguageSwitch value={view.language} onChange={changeLanguage} />
      <View className={styles.searchBox}>
        <Text className={styles.searchIcon}>⌕</Text>
        <Input
          className={styles.searchInput}
          value={view.query}
          placeholder="搜索单词或中文释义"
          placeholderClass={styles.searchPlaceholder}
          onInput={event => updateView({ ...view, query: event.detail.value })}
        />
        {view.query && <Button className={styles.clearSearch} onClick={() => updateView({ ...view, query: '' })}>清除</Button>}
      </View>
      <ScrollView scrollX className={styles.filterScroll} enhanced showScrollbar={false}>
        <View className={styles.filters}>
          {FILTERS.map(filter => (
            <Button
              key={filter.id}
              className={`${styles.filterButton} ${view.filter === filter.id ? styles.filterActive : ''}`}
              onClick={() => updateView({ ...view, filter: filter.id })}
            >
              {filter.label}
            </Button>
          ))}
        </View>
      </ScrollView>
      {error && (
        <View className={styles.errorBanner}>
          <Text>{error}</Text>
          {!selectedId && <Button className={styles.retryButton} onClick={() => void refreshEntries(view.language, true)}>重试词库</Button>}
        </View>
      )}

      {selectedWord ? (
        <ScrollView scrollY className={styles.detailScroll} enhanced showScrollbar={false}>
          <View className={styles.detailCard}>
            <View className={styles.detailTop}>
              <Button className={styles.backButton} onClick={closeDetail}>返回列表</Button>
              <Text className={styles.statusBadge}>{states[selectedWord.id]?.status === 'mastered' ? '已掌握' : states[selectedWord.id] ? `阶段 D${[0, 1, 2, 4, 7, 15, 30, 60][states[selectedWord.id].stage]}` : '尚未学习'}</Text>
            </View>
            {selectedWord.imageUrl ? (
              <Image className={styles.detailImage} src={selectedWord.imageUrl} mode="aspectFill" />
            ) : (
              <View className={styles.detailImageFallback}>
                <Text className={styles.detailFallbackWord}>{selectedWord.text}</Text>
                <Text>{selectedWord.language === 'en' ? 'IELTS 英语' : 'TOPIK 韩语'}</Text>
              </View>
            )}
            <View className={styles.detailBody}>
              <Text className={styles.detailWord}>{selectedWord.text}</Text>
              <Text className={styles.pronunciation}>{selectedWord.pronunciation}</Text>
              <Text className={styles.detailMeta}>{libraryLabel(selectedWord)}{' · '}{sourceNames(selectedWord)}</Text>
              <Text className={styles.detailStudyState}>
                {states[selectedWord.id]
                  ? `复习阶段 ${states[selectedWord.id].stage + 1}/8 · 下次 ${states[selectedWord.id].nextDueDate}`
                  : '尚未学习'}
              </Text>
              <View className={styles.definitionList}>
                <View className={styles.definitionItem}><Text className={styles.definitionLabel}>EN</Text><Text className={styles.definitionValue}>{selectedWord.definitionEn}</Text></View>
                {selectedWord.language === 'ko' && <View className={styles.definitionItem}><Text className={styles.definitionLabel}>KO</Text><Text className={styles.definitionValue}>{selectedWord.definitionKo}</Text></View>}
                <View className={styles.definitionItem}><Text className={styles.definitionLabel}>中文</Text><Text className={styles.definitionValue}>{selectedWord.definitionZh}</Text></View>
              </View>

              <View className={styles.audioTabs}>
                <Button className={audio.key.endsWith(':word') ? styles.audioTabActive : styles.audioTab} onClick={() => selectAudio(`${selectedWord.id}:word`, selectedWord.wordAudioUrl)}>单词发音</Button>
                <Button className={audio.key.endsWith(':phrase') ? styles.audioTabActive : styles.audioTab} onClick={() => selectAudio(`${selectedWord.id}:phrase`, selectedWord.phrase.audioUrl)}>短语发音</Button>
                <Button className={audio.key.endsWith(':example') ? styles.audioTabActive : styles.audioTab} onClick={() => selectAudio(`${selectedWord.id}:example`, selectedWord.example.audioUrl)}>例句发音</Button>
              </View>
              <AudioGate key={audio.key} src={audio.src} audioKey={audio.key} onCompleted={() => undefined} onInterrupted={() => undefined} />

              <View className={styles.contentSection}>
                <Text className={styles.sectionLabel}>常用短语</Text>
                <Text className={styles.sectionText}>{selectedWord.phrase.text}</Text>
                <Text className={styles.sectionTranslation}>{selectedWord.phrase.translationZh}</Text>
              </View>
              <View className={styles.contentSection}>
                <Text className={styles.sectionLabel}>例句</Text>
                <Text className={styles.sectionText}>{selectedWord.example.text}</Text>
                <Text className={styles.sectionTranslation}>{selectedWord.example.translationZh}</Text>
              </View>

              {selectedWord.source === 'custom' && (
                <View className={styles.detailActions}>
                  <Button className={styles.editButton} onClick={() => Taro.navigateTo({ url: `/pages/word-edit/index?id=${selectedWord.id}` })}>编辑词条</Button>
                  <Button className={styles.deleteButton} onClick={() => deleteWord(selectedWord)}>删除</Button>
                </View>
              )}
              {states[selectedWord.id]?.status === 'mastered' && <Button className={styles.relearnButton} onClick={() => relearn(selectedWord)}>重新加入学习队列</Button>}
            </View>
          </View>
        </ScrollView>
      ) : selectedId ? (
        <View className={styles.loadingState}>
          <Text className={styles.emptyTitle}>{detailLoading ? '正在读取词条' : '词条读取失败'}</Text>
          <Text className={styles.emptyText}>{detailLoading ? '只加载当前词条的完整内容。' : error || '请重试。'}</Text>
          <Button className={styles.emptyAction} onClick={() => detailLoading ? closeDetail() : void openWordById(selectedId, true)}>
            {detailLoading ? '返回列表' : '重试词条'}
          </Button>
          {!detailLoading && <Button className={styles.emptyAction} onClick={closeDetail}>返回列表</Button>}
        </View>
      ) : (
        <View className={styles.listSection}>
          <View className={styles.resultMeta}><Text>{visiblePage.total} 个词条</Text><Text>{view.language === 'en' ? 'IELTS' : 'TOPIK'}</Text></View>
          {listLoading ? (
            <View className={styles.loadingState}><Text>正在读取轻量词库索引…</Text></View>
          ) : visiblePage.total === 0 ? (
            <View className={styles.emptyState}>
              <Text className={styles.emptyTitle}>{view.query ? '当前语言中未找到该单词' : view.filter !== 'all' ? '当前筛选下没有词条' : '当前语言还没有生词'}</Text>
              <Text className={styles.emptyText}>{view.query ? '可清空搜索后查看全部词条。' : view.filter !== 'all' ? '可切换筛选类型，这不代表整个生词本为空。' : `添加第一个${view.language === 'en' ? '英语' : '韩语'}生词，开始学习。`}</Text>
              {view.query ? <Button className={styles.emptyAction} onClick={() => updateView({ ...view, query: '' })}>清空搜索</Button> : view.filter === 'all' || view.filter === 'custom' ? <Button className={styles.emptyAction} onClick={() => Taro.navigateTo({ url: `/pages/word-edit/index?language=${view.language}` })}>添加生词</Button> : null}
            </View>
          ) : (
            <>
              <View className={styles.wordList}>
                {visiblePage.items.map(word => (
                  <View className={styles.wordItem} key={word.id} onClick={() => openWord(word)}>
                    <View className={styles.thumbnailFallback}><Text>{word.text.slice(0, 1)}</Text></View>
                    <View className={styles.wordItemBody}>
                      <View className={styles.wordItemTitle}>
                        <Text className={styles.wordItemText}>{word.text}</Text>
                        {word.source === 'custom' && <Text className={styles.customBadge}>自定义</Text>}
                      </View>
                      <Text className={styles.wordItemDefinition}>{word.definitionZh}</Text>
                      <Text className={styles.wordItemMeta}>{libraryLabel(word)}{' · '}{sourceNames(word)}</Text>
                      <Text className={styles.wordItemMeta}>{states[word.id]?.status === 'mastered' ? '已完成 60 天复习' : states[word.id] ? `复习阶段 ${states[word.id].stage + 1}/8 · 下次 ${states[word.id].nextDueDate}` : '尚未学习'} · {word.contentStatus === 'ready' ? '内容完整' : '待完善'}</Text>
                    </View>
                    <Text className={styles.chevron}>›</Text>
                  </View>
                ))}
              </View>
              <View className={styles.pagination}>
                <Button className={styles.pageButton} disabled={visiblePage.page <= 1} onClick={() => setPage(visiblePage.page - 1)}>上一页</Button>
                <Text className={styles.pageLabel}>第 {visiblePage.page} / {visiblePage.pageCount} 页</Text>
                <Button className={styles.pageButton} disabled={visiblePage.page >= visiblePage.pageCount} onClick={() => setPage(visiblePage.page + 1)}>下一页</Button>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  )
}
