import { Button, View } from '@tarojs/components'
import classnames from 'classnames'
import type { Language } from '../../types/word'
import styles from './index.module.scss'

interface LanguageSwitchProps {
  value: Language
  onChange: (language: Language) => void
  labels?: Partial<Record<Language, string>>
}

export default function LanguageSwitch({ value, onChange, labels }: LanguageSwitchProps) {
  const options: Array<{ value: Language; label: string }> = [
    { value: 'en', label: labels?.en || 'IELTS 英语' },
    { value: 'ko', label: labels?.ko || 'TOPIK 韩语' }
  ]
  return (
    <View className={styles.languageSwitch}>
      {options.map(option => (
        <Button
          key={option.value}
          className={classnames(styles.switchOption, value === option.value && styles.switchOptionActive)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </View>
  )
}
