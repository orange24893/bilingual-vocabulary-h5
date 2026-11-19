import { useEffect, useRef, useState } from 'react'
import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidHide, useDidShow, useRouter, useUnload } from '@tarojs/taro'
import AudioGate from '../../components/AudioGate'
import { stopAudio } from '../../services/audio'
import {
  completeWord,
  loadDailyRecords,
  loadSession,
  loadSettings,
  loadStudyStates,
  saveSession
} from '../../services/storage'
import { loadIndexEntries, loadWord, resetVocabularyCache } from '../../services/vocabulary'
import type { Language, Rating, SessionProgress, StudyMode, StudyState, Word } from '../../types/word'
import { buildDailyQueue, getToday } from '../../utils/scheduler.cjs'
import { canAdvance, completeAudio, getSteps, interruptAudio } from '../../utils/study-flow.cjs'
import { repairSession } from '../../utils/vocabulary.cjs'
import styles from './index.module.scss'

const LANGUAGE_NAMES: Record<Language, string> = { en: 'IELTS 英语', ko: 'TOPIK 韩语' }
const RATINGS: Array<{ id: Rating; label: string; hint: string }> = [
  { id: 'unknown', label: '不认识', hint: '回到初始阶段' },
  { id: 'fuzzy', label: '模糊', hint: '明天再次复习' },
  { id: 'known', label: '认识', hint: '推进记忆阶段' }
]

function isLanguage(value: string): value is Language {
  return value === 'en' || value === 'ko'
}

export default function Study() {
  const router = useRouter()
  const routeLanguage = router.params.language || ''
  const language: Language = isLanguage(routeLanguage) ? routeLanguage : 'en'
  const routeMode: StudyMode = router.params.mode === 'new' ? 'new' : 'review'
  const [session, setSession] = useState<SessionProgress | null>(null)
  const [currentWord, setCurrentWord] = useState<Word | null>(null)
  const [wordLoading, setWordLoading] = useState(false)
  const [wordAttempt, setWordAttempt] = useState(0)
  const [studyStates, setStudyStates] = useState<Record<string, StudyState>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [imageAttempt, setImageAttempt] = useState(0)
  const sessionRef = useRef<SessionProgress | null>(null)
  const wordRequest = useRef(0)

  const commitSession = (next: SessionProgress | null) => {
    sessionRef.current = next
    setSession(next)
  }

  const createSession = async (mode: StudyMode) => {
    const words = await loadIndexEntries(language)
    const states = loadStudyStates()
    setStudyStates(states)
    const settings = loadSettings()
    const records = loadDailyRecords()
    const today = getToday()
    const daily = records[`${today}:${language}`]
    const queue = buildDailyQueue({
      words,
      states,
      today,
      language,
      newTarget: settings.dailyTargets[language],
      completedNewIds: daily?.completedNewIds || []
    })
    const next: SessionProgress = {
      date: today,
      language,
      wordIds: mode === 'review' ? queue.reviewIds : queue.newIds,
      currentWordIndex: 0,
      currentStepId: 'word',
      completedAudioKeys: [],
      mode
    }
    saveSession(next)
    commitSession(next)
    setImageFailed(false)
    setImageAttempt(0)
  }

  useDidShow(() => {
    void (async () => {
      try {
        const words = await loadIndexEntries(language)
        const existing = loadSession()
        const today = getToday()
        setStudyStates(loadStudyStates())
        if (
          existing && existing.date === today && existing.language === language &&
          existing.currentWordIndex < existing.wordIds.length
        ) {
          const repaired = repairSession(existing, new Set(words.map(word => word.id)))
          if (JSON.stringify(repaired) !== JSON.stringify(existing)) saveSession(repaired)
          commitSession(repaired)
        } else {
          await createSession(routeMode)
        }
        setError('')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '学习队列加载失败')
      }
    })()
  })

  const interruptCurrentAudio = () => {
    stopAudio()
    const current = sessionRef.current
    if (!current) return
    const step = getSteps(current.language).find(item => item.id === current.currentStepId)
    if (!step?.audioKey || !current.completedAudioKeys.includes(step.audioKey)) return
    const next = { ...current, completedAudioKeys: interruptAudio(current.completedAudioKeys, step.audioKey) }
    try {
      saveSession(next)
      commitSession(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '音频状态保存失败')
    }
  }

  useDidHide(interruptCurrentAudio)
  useUnload(interruptCurrentAudio)

  const currentWordId = session && session.currentWordIndex < session.wordIds.length
    ? session.wordIds[session.currentWordIndex]
    : undefined

  useEffect(() => {
    const requestId = ++wordRequest.current
    interruptCurrentAudio()
    setCurrentWord(null)
    setImageFailed(false)
    setImageAttempt(0)
    if (!currentWordId) {
      setWordLoading(false)
      return
    }
    setWordLoading(true)
    void (async () => {
      try {
        const word = await loadWord(currentWordId)
        if (wordRequest.current !== requestId) return
        if (!word) {
          const current = sessionRef.current
          if (current) {
            const validIds = new Set(current.wordIds.filter(id => id !== currentWordId))
            const repaired = repairSession(current, validIds)
            saveSession(repaired)
            commitSession(repaired)
          }
          return
        }
        setCurrentWord(word)
        setError('')
      } catch (cause) {
        if (wordRequest.current === requestId) {
          const message = cause instanceof Error ? cause.message : '未知错误'
          setError(`词条读取失败：${message}`)
        }
      } finally {
        if (wordRequest.current === requestId) setWordLoading(false)
      }
    })()
    return () => {
      if (wordRequest.current === requestId) wordRequest.current += 1
    }
  }, [currentWordId, wordAttempt])

  const steps = getSteps(language)
  const currentStep = session ? steps.find(step => step.id === session.currentStepId) || steps[0] : steps[0]
  const currentStepIndex = session ? steps.findIndex(step => step.id === currentStep.id) : 0
  const currentStudyState = currentWord ? studyStates[currentWord.id] : undefined
  const audioCompleted = Boolean(session && canAdvance(currentStep, session.completedAudioKeys))
  const isLastStep = currentStepIndex === steps.length - 1
  const isFinished = Boolean(session && session.currentWordIndex >= session.wordIds.length)

  const updateAudioKeys = (audioKey: string, completed: boolean) => {
    const current = sessionRef.current
    if (!current) return
    const next = {
      ...current,
      completedAudioKeys: completed
        ? completeAudio(current.completedAudioKeys, audioKey)
        : interruptAudio(current.completedAudioKeys, audioKey)
    }
    try {
      saveSession(next)
      commitSession(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学习进度保存失败')
    }
  }

  const goNextStep = () => {
    if (!session || !audioCompleted || saving || wordLoading) return
    if (isLastStep) return
    const next = { ...session, currentStepId: steps[currentStepIndex + 1].id }
    try {
      saveSession(next)
      commitSession(next)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学习进度保存失败')
    }
  }

  const rateWord = (rating: Rating) => {
    if (!session || !currentWord || !audioCompleted || saving || wordLoading) return
    setSaving(true)
    try {
      const result = completeWord({ word: currentWord, rating, today: getToday(), mode: session.mode })
      setStudyStates(current => ({ ...current, [currentWord.id]: result.nextState }))
      const nextIndex = session.currentWordIndex + 1
      const next = {
        ...session,
        currentWordIndex: nextIndex,
        currentStepId: 'word',
        completedAudioKeys: []
      }
      saveSession(next)
      commitSession(next)
      setImageFailed(false)
      setImageAttempt(0)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '学习结果保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const audioSource = currentWord && currentStep.audioKey
    ? currentStep.audioKey === 'word'
      ? currentWord.wordAudioUrl
      : currentStep.audioKey === 'phrase'
        ? currentWord.phrase.audioUrl
        : currentWord.example.audioUrl
    : ''

  const finish = () => Taro.navigateBack()

  return (
    <View className={styles.container}>
      <View className={styles.topBar}>
        <View>
          <Text className={styles.languageLabel}>{LANGUAGE_NAMES[language]}</Text>
          <Text className={styles.modeLabel}>{session?.mode === 'review' ? `到期复习${currentStudyState ? ` · D${[0, 1, 2, 4, 7, 15, 30, 60][currentStudyState.stage]}` : ''}` : '今日新词'}</Text>
        </View>
        {session && session.wordIds.length > 0 && !isFinished && (
          <Text className={styles.wordCounter}>{Math.min(session.currentWordIndex + 1, session.wordIds.length)} / {session.wordIds.length}</Text>
        )}
      </View>
      {session && session.wordIds.length > 0 && !isFinished && (
        <View className={styles.progressTrack}>
          <View className={styles.progressFill} style={{ width: `${((session.currentWordIndex + currentStepIndex / steps.length) / session.wordIds.length) * 100}%` }} />
        </View>
      )}
      {error && <View className={styles.errorBanner}><Text>{error}</Text></View>}

      {!session || isFinished || session.wordIds.length === 0 ? (
        <View className={styles.resultCard}>
          <Text className={styles.resultEyebrow}>{session?.mode === 'review' ? 'REVIEW COMPLETE' : 'DAILY COMPLETE'}</Text>
          <Text className={styles.resultTitle}>{session && session.wordIds.length > 0 ? '本轮学习已完成' : '当前没有待学习内容'}</Text>
          <Text className={styles.resultText}>
            {session?.mode === 'review' ? '到期复习已处理，接下来可以继续今日新词。' : '新词进度已保存在本机，可返回查看今日数据。'}
          </Text>
          {session?.mode === 'review' && (
            <Button className={styles.primaryButton} onClick={() => void createSession('new')}>继续今日新词</Button>
          )}
          <Button className={styles.secondaryButton} onClick={finish}>返回今日学习</Button>
        </View>
      ) : wordLoading ? (
        <View className={styles.resultCard}>
          <Text className={styles.resultTitle}>正在读取词条</Text>
          <Text className={styles.resultText}>只加载当前学习内容，请稍候。</Text>
        </View>
      ) : !currentWord ? (
        <View className={styles.resultCard}>
          <Text className={styles.resultTitle}>词条读取失败</Text>
          <Text className={styles.resultText}>{error || '词条内容暂时不可用，请重试。'}</Text>
          <Button
            className={styles.primaryButton}
            onClick={() => {
              resetVocabularyCache()
              setWordAttempt(value => value + 1)
            }}
          >
            重试词条
          </Button>
          <Button className={styles.secondaryButton} onClick={finish}>返回</Button>
        </View>
      ) : (
        <ScrollView scrollY className={styles.studyScroll} enhanced showScrollbar={false}>
          <View className={styles.wordCard}>
            <View className={styles.imageWrap}>
              {!imageFailed && currentWord.imageUrl ? (
                <Image
                  key={`${currentWord.id}:${imageAttempt}`}
                  className={styles.wordImage}
                  src={currentWord.imageUrl}
                  mode="aspectFill"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <View className={styles.imageFallback}>
                  <Text>配图暂时无法显示</Text>
                  {currentWord.imageUrl && <Button className={styles.imageRetry} onClick={() => { setImageFailed(false); setImageAttempt(value => value + 1) }}>重试</Button>}
                </View>
              )}
              <View className={styles.stepBadge}><Text>{currentStepIndex + 1} / {steps.length}</Text></View>
            </View>

            <View className={styles.content}>
              {currentStep.id === 'word' && (
                <View className={styles.stepContent}>
                  <Text className={styles.wordText}>{currentWord.text}</Text>
                  <Text className={styles.pronunciation}>{currentWord.pronunciation}</Text>
                  <View className={styles.definitionBlock}>
                    <Text className={styles.definitionLabel}>ENGLISH</Text>
                    <Text className={styles.definitionText}>{currentWord.definitionEn}</Text>
                  </View>
                </View>
              )}
              {currentStep.id === 'definitionKo' && (
                <View className={styles.stepContent}>
                  <Text className={styles.sectionEyebrow}>韩语释义</Text>
                  <Text className={styles.largeDefinition}>{currentWord.definitionKo}</Text>
                </View>
              )}
              {currentStep.id === 'definitionZh' && (
                <View className={styles.stepContent}>
                  <Text className={styles.sectionEyebrow}>中文释义</Text>
                  <Text className={styles.largeDefinition}>{currentWord.definitionZh}</Text>
                </View>
              )}
              {currentStep.id === 'phrase' && (
                <View className={styles.stepContent}>
                  <Text className={styles.sectionEyebrow}>常用短语</Text>
                  <Text className={styles.phraseText}>{currentWord.phrase.text}</Text>
                  <Text className={styles.translation}>{currentWord.phrase.translationZh}</Text>
                </View>
              )}
              {currentStep.id === 'example' && (
                <View className={styles.stepContent}>
                  <Text className={styles.sectionEyebrow}>例句</Text>
                  <Text className={styles.exampleText}>{currentWord.example.text}</Text>
                  <Text className={styles.translation}>{currentWord.example.translationZh}</Text>
                </View>
              )}

              {currentStep.audioKey ? (
                <AudioGate
                  key={`${currentWord.id}:${currentStep.audioKey}`}
                  src={audioSource}
                  audioKey={currentStep.audioKey}
                  onCompleted={key => updateAudioKeys(key, true)}
                  onInterrupted={key => updateAudioKeys(key, false)}
                />
              ) : (
                <View className={styles.readingNote}><Text>阅读完成后继续，下一步将播放对应发音。</Text></View>
              )}

              {!isLastStep ? (
                <Button className={styles.primaryButton} disabled={!audioCompleted || saving || wordLoading} onClick={goNextStep}>继续</Button>
              ) : (
                <View className={styles.ratingSection}>
                  <Text className={styles.ratingTitle}>这次记得怎么样？</Text>
                  <View className={styles.ratingButtons}>
                    {RATINGS.map(rating => (
                      <Button
                        key={rating.id}
                        className={`${styles.ratingButton} ${styles[`rating_${rating.id}`]}`}
                        disabled={!audioCompleted || saving || wordLoading}
                        onClick={() => rateWord(rating.id)}
                      >
                        <Text className={styles.ratingLabel}>{rating.label}</Text>
                        <Text className={styles.ratingHint}>{rating.hint}</Text>
                      </Button>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  )
}
