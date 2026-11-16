import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Ros } from 'roslib'
import { RosContext } from './RosContext'
import { DEFAULT_RECONNECT_DELAY_MS, DEFAULT_ROSBRIDGE_URL } from './topics'

interface RosProviderProps {
  url?: string
  reconnectDelayMs?: number
  children: ReactNode
}

/**
 * 整個 App 共用一條 rosbridge 連線，斷線後自動重連。
 * Topic 使用 roslib 預設的 reconnect_on_close，重連後會自動重新訂閱。
 */
export function RosProvider({
  url = DEFAULT_ROSBRIDGE_URL,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  children,
}: RosProviderProps) {
  const [ros, setRos] = useState<Ros | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    const instance = new Ros()
    let disposed = false
    let timer: number | undefined

    const connect = () => {
      if (disposed) return
      instance.connect(url).catch((err: unknown) => {
        if (!disposed) setError(err)
      })
    }

    instance.on('connection', () => {
      // 連上後才把 instance 交給下游訂閱；斷線重連沿用同一個 instance，Topic 會自動重訂閱
      setRos(instance)
      setConnected(true)
      setError(null)
    })
    instance.on('error', (err) => {
      setError(err)
    })
    instance.on('close', () => {
      setConnected(false)
      if (disposed) return
      window.clearTimeout(timer)
      timer = window.setTimeout(connect, reconnectDelayMs)
    })

    connect()

    return () => {
      disposed = true
      window.clearTimeout(timer)
      instance.close()
      setRos(null)
      setConnected(false)
    }
  }, [url, reconnectDelayMs])

  const value = useMemo(() => ({ ros, connected, url, error }), [ros, connected, url, error])

  return <RosContext.Provider value={value}>{children}</RosContext.Provider>
}
