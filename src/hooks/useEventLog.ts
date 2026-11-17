import { useSyncExternalStore } from 'react'
import { eventLogStore, type LogEntry } from '../eventLog/eventLogStore'

/** 全站事件紀錄（舊 → 新）；需在 App 內放 <EventLogRecorder> 才會有新紀錄寫入 */
export function useEventLog(): { entries: LogEntry[]; clear: () => void } {
  const entries = useSyncExternalStore(eventLogStore.subscribe, eventLogStore.getSnapshot)
  return { entries, clear: eventLogStore.clear }
}
