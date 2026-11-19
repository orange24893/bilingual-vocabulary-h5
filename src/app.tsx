import { useEffect } from 'react'
import type { ReactNode } from 'react'
import Taro from '@tarojs/taro'
import './app.scss'

interface AppProps {
  children?: ReactNode
}

function App(props: AppProps) {
  useEffect(() => {
    if (process.env.TARO_ENV === 'weapp') {
      Taro.cloud.init({ env: '', traceUser: true })
    }
  }, [])

  return props.children
}

export default App
