import { useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { DEFAULT_SETTINGS, loadDailyRecords, loadSettings, loadStudyStates, saveSettings } from '../../services/storage'
import type { Language, Settings } from '../../types/word'
import styles from './index.module.scss'

const LANGUAGE_NAMES: Record<Language, string> = { en: 'IELTS 英语', ko: 'TOPIK 韩语' }

export default function Profile() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [counts, setCounts] = useState<Record<Language, { learning: number; mastered: number; completed: number }>>({
    en: { learning: 0, mastered: 0, completed: 0 },
    ko: { learning: 0, mastered: 0, completed: 0 }
  })
  const [message, setMessage] = useState('')

  useDidShow(() => {
    try {
      setSettings(loadSettings())
      const states = Object.values(loadStudyStates())
      const records = Object.values(loadDailyRecords())
      const next = { ...counts }
      ;(['en', 'ko'] as Language[]).forEach(language => {
        const ownStates = states.filter(state => state.language === language)
        const completed = new Set<string>()
        records.filter(record => record.language === language).forEach(record => {
          record.completedNewIds.forEach(id => completed.add(id))
          record.completedReviewIds.forEach(id => completed.add(id))
        })
        next[language] = {
          learning: ownStates.filter(state => state.status === 'learning').length,
          mastered: ownStates.filter(state => state.status === 'mastered').length,
          completed: completed.size
        }
      })
      setCounts(next)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '本地统计读取失败')
    }
  })

  const updateTarget = (language: Language, value: number) => {
    const normalized = Number.isFinite(value) ? Math.min(200, Math.max(1, Math.round(value))) : 1
    setSettings(current => ({ ...current, dailyTargets: { ...current.dailyTargets, [language]: normalized } }))
  }

  const persistSettings = () => {
    try {
      saveSettings(settings)
      setMessage('每日新词目标已保存，今日已完成数量不变')
      Taro.showToast({ title: '设置已保存', icon: 'success' })
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '设置保存失败')
    }
  }

  const clearMediaCache = async () => {
    const confirmed = await Taro.showModal({
      title: '清除图片与音频缓存',
      content: '仅清除已下载的图片与音频缓存，不删除单词、学习记录、每日进度或设置。',
      confirmText: '清除缓存'
    })
    if (!confirmed.confirm) return
    try {
      if (process.env.TARO_ENV !== 'weapp') {
        setMessage('H5 预览没有微信媒体文件缓存；学习记录未改动')
        return
      }
      const result = await Taro.getSavedFileList() as unknown as { savedFileList: Array<{ filePath: string }> }
      const mediaFiles = result.savedFileList.filter(file => file.filePath.includes('vocab-media'))
      const fileSystem = Taro.getFileSystemManager()
      mediaFiles.forEach(file => fileSystem.unlinkSync(file.filePath))
      setMessage(`已清除 ${mediaFiles.length} 个图片与音频缓存文件；学习记录未改动`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '媒体缓存清理失败')
    }
  }

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <Text className={styles.kicker}>YOUR LEARNING</Text>
        <Text className={styles.title}>学习设置</Text>
        <Text className={styles.subtitle}>为每种语言保留适合自己的节奏。</Text>
      </View>
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>每日新词目标</Text>
        <Text className={styles.sectionHint}>可分别设置 1–200 个，复习始终优先。</Text>
        {(['en', 'ko'] as Language[]).map(language => (
          <View className={styles.settingRow} key={language}>
            <View className={styles.settingCopy}>
              <Text className={styles.settingName}>{LANGUAGE_NAMES[language]}</Text>
              <Text className={styles.settingDescription}>每天最多学习的新词数量</Text>
            </View>
            <View className={styles.stepper}>
              <Button className={styles.stepButton} onClick={() => updateTarget(language, settings.dailyTargets[language] - 1)}>−</Button>
              <Input
                className={styles.targetInput}
                type='number'
                value={String(settings.dailyTargets[language])}
                onBlur={event => updateTarget(language, Number(event.detail.value))}
              />
              <Button className={styles.stepButton} onClick={() => updateTarget(language, settings.dailyTargets[language] + 1)}>+</Button>
            </View>
          </View>
        ))}
        <Button className={styles.primaryButton} onClick={persistSettings}>保存每日目标</Button>
      </View>
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>本地学习统计</Text>
        {(['en', 'ko'] as Language[]).map(language => (
          <View className={styles.statsBlock} key={language}>
            <Text className={styles.statsLanguage}>{LANGUAGE_NAMES[language]}</Text>
            <View className={styles.statsRow}>
              <View className={styles.stat}><Text className={styles.statValue}>{counts[language].learning}</Text><Text className={styles.statLabel}>学习中</Text></View>
              <View className={styles.stat}><Text className={styles.statValue}>{counts[language].mastered}</Text><Text className={styles.statLabel}>已掌握</Text></View>
              <View className={styles.stat}><Text className={styles.statValue}>{counts[language].completed}</Text><Text className={styles.statLabel}>累计学习</Text></View>
            </View>
          </View>
        ))}
      </View>
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>存储管理</Text>
        <Text className={styles.sectionHint}>媒体缓存可以重新下载，清理不会影响任何学习数据。</Text>
        <Button className={styles.secondaryButton} onClick={clearMediaCache}>清除图片与音频缓存</Button>
      </View>
      {message && <View className={styles.message}><Text>{message}</Text></View>}
      <Text className={styles.privacyNote}>无需登录 · 不同步到其他设备 · 不含社交与评分功能</Text>
    </View>
  )
}
