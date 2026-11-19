import Taro from '@tarojs/taro'

let currentContext: Taro.InnerAudioContext | null = null
let rejectCurrent: ((reason?: unknown) => void) | null = null

function createInterruptionError(): Error {
  const error = new Error('音频播放已中断')
  error.name = 'AbortError'
  return error
}

export function stopAudio(): void {
  const reject = rejectCurrent
  const context = currentContext
  rejectCurrent = null
  currentContext = null
  if (reject) reject(createInterruptionError())
  if (context) {
    context.stop()
    context.destroy()
  }
}

export function playAudio(src: string): Promise<void> {
  stopAudio()
  return new Promise((resolve, reject) => {
    const context = Taro.createInnerAudioContext()
    currentContext = context
    let settled = false

    const cleanup = () => {
      if (currentContext === context) currentContext = null
      if (rejectCurrent === rejectPending) rejectCurrent = null
      context.destroy()
    }
    const resolvePending = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const rejectPending = (reason?: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(reason instanceof Error ? reason : new Error('音频播放失败'))
    }

    rejectCurrent = rejectPending
    context.autoplay = false
    context.src = src
    context.onEnded(resolvePending)
    context.onError(error => rejectPending(new Error(error.errMsg || '音频加载或播放失败')))
    context.onStop(() => rejectPending(createInterruptionError()))
    void Promise.resolve(context.play()).catch(rejectPending)
  })
}
