import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import classnames from 'classnames'
import { playAudio, stopAudio } from '../../services/audio'
import styles from './index.module.scss'

interface AudioGateProps {
  src: string
  audioKey: string
  onCompleted: (audioKey: string) => void
  onInterrupted: (audioKey: string) => void
}

type PlaybackStatus = 'loading' | 'playing' | 'completed' | 'error'

export default function AudioGate({ src, audioKey, onCompleted, onInterrupted }: AudioGateProps) {
  const [status, setStatus] = useState<PlaybackStatus>('loading')
  const requestId = useRef(0)
  const callbacks = useRef({ onCompleted, onInterrupted })
  callbacks.current = { onCompleted, onInterrupted }

  const start = useCallback(() => {
    const currentRequest = ++requestId.current
    stopAudio()
    if (!src) {
      setStatus('error')
      callbacks.current.onInterrupted(audioKey)
      return
    }
    setStatus('loading')
    callbacks.current.onInterrupted(audioKey)
    const playback = playAudio(src)
    setStatus('playing')
    playback
      .then(() => {
        if (currentRequest !== requestId.current) return
        setStatus('completed')
        callbacks.current.onCompleted(audioKey)
      })
      .catch(error => {
        if (currentRequest !== requestId.current) return
        if (error?.name !== 'AbortError') console.error('[AudioGate] playback failed:', error)
        setStatus('error')
        callbacks.current.onInterrupted(audioKey)
      })
  }, [src, audioKey])

  useEffect(() => {
    start()
    return () => {
      requestId.current += 1
      stopAudio()
      callbacks.current.onInterrupted(audioKey)
    }
  }, [start, audioKey])

  const statusText = {
    loading: '正在加载发音',
    playing: '正在播放完整发音',
    completed: '发音已完成，可以继续',
    error: src ? '播放失败或已中断，请重试' : '音频资源缺失，请完善内容后重试'
  }[status]

  return (
    <View className={classnames(styles.audioGate, status === 'completed' && styles.completed, status === 'error' && styles.error)}>
      <View className={styles.statusRow}>
        <View className={styles.soundMark}><Text className={styles.soundMarkText}>{status === 'playing' ? ')))' : '声'}</Text></View>
        <View className={styles.statusCopy}>
          <Text className={styles.statusTitle}>{statusText}</Text>
          <Text className={styles.statusHint}>{status === 'completed' ? '可重播，重播后需再次完整收听' : '不提供快进或跳过，请完整收听'}</Text>
        </View>
      </View>
      <Button className={styles.replayButton} onClick={start}>{status === 'error' ? '重试播放' : '重新播放'}</Button>
    </View>
  )
}
