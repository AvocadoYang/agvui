import { useEffect, useRef } from 'react'
import { useErrorInfo, useIoInfo, useRos } from '../hooks/useRos'
import { activeAlarms } from '../pages/DetailInfo/sections'
import type { ErrorInfo } from '../ros/types'
import { eventLogStore, type NewLogEntry } from './eventLogStore'

const toArray = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

/** error_info 有兩種形狀（見 types.ts），統一成「[id] 訊息」字串陣列 */
function errorMessages(info: ErrorInfo): string[] {
  const src = info.data ?? info
  const ids = toArray(src.warning_id)
  return toArray(src.warning_msg)
    .map((msg, i) => (ids[i] != null ? `[${ids[i]}] ${msg}` : String(msg)))
    .filter((m) => m.trim() !== '')
}

interface IoSnapshot {
  alarms: Set<string>
  isAuto: boolean
  firmwareOk: boolean
}

/**
 * 全站事件紀錄器：放在 RosProvider 底下，不管目前在哪一頁都會記。
 * 只記「狀態改變」，同樣的狀態重複收到不會重複記。
 */
export function EventLogRecorder() {
  const { connected } = useRos()
  const io = useIoInfo()
  const errorInfo = useErrorInfo()

  /* ROS 連線 */
  const prevConnected = useRef(false)
  useEffect(() => {
    if (connected === prevConnected.current) return
    prevConnected.current = connected
    eventLogStore.append([
      connected
        ? { level: 'success', category: 'ros', messageKey: 'log.msg.rosConnected' }
        : { level: 'error', category: 'ros', messageKey: 'log.msg.rosDisconnected' },
    ])
  }, [connected])

  /* io_info：警報、韌體板連線、模式 */
  const prevIo = useRef<IoSnapshot | null>(null)
  useEffect(() => {
    if (!io) return
    const cur: IoSnapshot = {
      alarms: new Set(activeAlarms(io)),
      isAuto: Number(io.manual_mode) !== 0,
      firmwareOk: Number(io.heartBeatSignal) === 0,
    }
    const prev = prevIo.current
    prevIo.current = cur

    const items: NewLogEntry[] = []
    for (const key of cur.alarms) {
      if (!prev?.alarms.has(key)) {
        items.push({ level: 'error', category: 'alarm', messageKey: 'log.msg.alarmTriggered', subjectKey: key })
      }
    }
    for (const key of prev?.alarms ?? []) {
      if (!cur.alarms.has(key)) {
        items.push({ level: 'success', category: 'alarm', messageKey: 'log.msg.alarmCleared', subjectKey: key })
      }
    }
    // 收到第一筆資料時，只有異常狀態才記
    if (prev ? prev.firmwareOk !== cur.firmwareOk : !cur.firmwareOk) {
      items.push(
        cur.firmwareOk
          ? { level: 'success', category: 'firmware', messageKey: 'log.msg.firmwareConnected' }
          : { level: 'error', category: 'firmware', messageKey: 'log.msg.firmwareDisconnected' },
      )
    }
    if (prev ? prev.isAuto !== cur.isAuto : !cur.isAuto) {
      items.push(
        cur.isAuto
          ? { level: 'info', category: 'mode', messageKey: 'log.msg.modeAuto' }
          : { level: 'warning', category: 'mode', messageKey: 'log.msg.modeMaintenance' },
      )
    }
    eventLogStore.append(items)
  }, [io])

  /* error_info：新出現 / 消失的錯誤訊息 */
  const prevErrors = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!errorInfo) return
    const cur = new Set(errorMessages(errorInfo))
    const prev = prevErrors.current
    prevErrors.current = cur

    const items: NewLogEntry[] = []
    for (const text of cur) {
      if (!prev.has(text)) items.push({ level: 'warning', category: 'error', messageKey: 'log.msg.errorRaised', text })
    }
    for (const text of prev) {
      if (!cur.has(text)) items.push({ level: 'success', category: 'error', messageKey: 'log.msg.errorCleared', text })
    }
    eventLogStore.append(items)
  }, [errorInfo])

  return null
}
