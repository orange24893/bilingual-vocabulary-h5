import { useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  loadDailyRecords,
  loadSession,
  loadSettings,
  loadStudyStates,
  saveSettings
} from '../../services/storage'
import { loadIndexEntries, resetVocabularyCache } from '../../services/vocabulary'
import type { Language } from '../../types/word'
import { buildDailyQueue, calculateStreak, getToday } from '../../utils/scheduler.cjs'
import styles from './index.module.scss'

const LANGUAGES: Array<{ id: Language; eyebrow: string; name: string; description: string }> = [
  { id: 'en', eyebrow: 'IELTS', name: '英语', description: '学术词汇，稳步积累' },
  { id: 'ko', eyebrow: 'TOPIK', name: '韩语', description: '日常表达，循环记忆' }
]

interface DashboardSummary {
  completedNew: number
  newTarget: number
  remainingNew: number
  dueReviews: number
  streak: number
  canStudy: boolean
  resume: boolean
}

export default function Index() {
  const [summaries, setSummaries] = useState<Partial<Record<Language, DashboardSummary>>>({})
  const [error, setError] = useState('')
  const dashboardRequest = useRef(0)

  const refreshDashboard = async (resetCache = false) => {
    const requestId = ++dashboardRequest.current
    if (resetCache) resetVocabularyCache()
    try {
      const [englishWords, koreanWords] = await Promise.all([
        loadIndexEntries('en'),
        loadIndexEntries('ko')
      ])
      const words = [...englishWords, ...koreanWords]
      const states = loadStudyStates()
      const settings = loadSettings()
      const records = loadDailyRecords()
      const session = loadSession()
      const today = getToday()
      const nextSummaries: Partial<Record<Language, DashboardSummary>> = {}
      LANGUAGES.forEach(({ id }) => {
        const daily = records[`${today}:${id}`]
        const completedNewIds = daily?.completedNewIds || []
        const newTarget = settings.dailyTargets[id]
        const queue = buildDailyQueue({ words, states, today, language: id, newTarget, completedNewIds })
        const resume = Boolean(
          session && session.date === today && session.language === id &&
          session.currentWordIndex < session.wordIds.length
        )
        nextSummaries[id] = {
          completedNew: completedNewIds.length,
          newTarget,
          remainingNew: queue.newIds.length,
          dueReviews: queue.reviewIds.length,
          streak: calculateStreak(records, id, today),
          canStudy: resume || queue.reviewIds.length > 0 || queue.newIds.length > 0,
          resume
        }
      })
      if (dashboardRequest.current !== requestId) return
      setSummaries(nextSummaries)
      setError('')
    } catch (cause) {
      if (dashboardRequest.current === requestId) {
        setError(cause instanceof Error ? cause.message : '学习数据读取失败')
      }
    }
  }

  useDidShow(() => { void refreshDashboard() })

  const startStudy = (language: Language) => {
    try {
      const settings = loadSettings()
      saveSettings({ ...settings, lastLearningLanguage: language })
      const session = loadSession()
      const today = getToday()
      const resumable = session && session.date === today && session.language === language && session.currentWordIndex < session.wordIds.length
      const summary = summaries[language]
      const mode = resumable ? session.mode : summary && summary.dueReviews > 0 ? 'review' : 'new'
      Taro.navigateTo({ url: `/pages/study/index?language=${language}&mode=${mode}` })
    } catch (cause) {
      Taro.showToast({ title: cause instanceof Error ? cause.message : '暂时无法开始学习', icon: 'none' })
    }
  }

  return (
    <View className={styles.container}>
      <View className={styles.hero}>
        <Text className={styles.kicker}>DAILY VOCABULARY</Text>
        <Text className={styles.title}>今天，也记住一点。</Text>
        <Text className={styles.subtitle}>两种语言，各自独立的节奏与进步。</Text>
      </View>
      {error && (
        <View className={styles.errorBanner}>
          <Text>{error}</Text>
          <Button size='mini' onClick={() => void refreshDashboard(true)}>重试词库</Button>
        </View>
      )}
      <View className={styles.languageCards}>
        {LANGUAGES.map(language => {
          const summary = summaries[language.id]
          const modeLabel = summary?.resume ? '继续上次学习' : summary?.dueReviews ? '优先完成复习' : '开始学习新词'
          return (
            <View className={styles.languageCard} key={language.id}>
              <View className={styles.cardHeader}>
                <View className={styles.languageIdentity}>
                  <Text className={styles.languageCode}>{language.id.toUpperCase()}</Text>
                  <View>
                    <Text className={styles.eyebrow}>{language.eyebrow}</Text>
                    <Text className={styles.languageName}>{language.name}</Text>
                  </View>
                </View>
                <View className={styles.streakBadge}><Text>连续 {summary?.streak || 0} 天</Text></View>
              </View>
              <Text className={styles.languageDescription}>{language.description}</Text>
              <View className={styles.metrics}>
                <View className={styles.metric}>
                  <Text className={styles.metricValue}>{summary?.completedNew || 0}<Text className={styles.metricUnit}> / {summary?.newTarget || 30}</Text></Text>
                  <Text className={styles.metricLabel}>今日新词</Text>
                </View>
                <View className={styles.metricDivider} />
                <View className={styles.metric}>
                  <Text className={styles.metricValueAccent}>{summary?.dueReviews || 0}</Text>
                  <Text className={styles.metricLabel}>到期复习</Text>
                </View>
                <View className={styles.metricDivider} />
                <View className={styles.metric}>
                  <Text className={styles.metricValue}>{summary?.remainingNew || 0}</Text>
                  <Text className={styles.metricLabel}>可学新词</Text>
                </View>
              </View>
              <Button
                className={styles.studyButton}
                disabled={!summary?.canStudy}
                onClick={() => startStudy(language.id)}
              >
                {summary?.canStudy ? modeLabel : '今日内容已完成'}
              </Button>
              <Text className={styles.progressNote}>
                {summary?.dueReviews ? '复习完成后，可继续今日新词' : '按艾宾浩斯节奏安排复习'}
              </Text>
            </View>
          )
        })}
      </View>
      <View className={styles.footerNote}>
        <Text className={styles.footerTitle}>学习记录仅保存在本机</Text>
        <Text className={styles.footerText}>无需登录。每种语言的新词、复习与连续天数互不影响。</Text>
      </View>
    </View>
  )
}
