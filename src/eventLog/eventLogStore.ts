/**
 * 事件紀錄 store：存在 localStorage，最多保留 MAX_LOG_ENTRIES 筆。
 * 寫入由 <EventLogRecorder> 負責，讀取用 useEventLog()。
 */

export type LogLevel = 'error' | 'warning' | 'info' | 'success'
export type LogCategory = 'alarm' | 'error' | 'firmware' | 'mode' | 'ros'

export const LOG_CATEGORIES: LogCategory[] = ['alarm', 'error', 'firmware', 'mode', 'ros']

/**
 * 一筆事件紀錄。訊息存 i18n key 而非翻好的文字，切換語言時舊紀錄也會跟著換。
 * 顯示方式：t(messageKey, { name: subjectKey ? t(subjectKey) : text })
 */
export interface LogEntry {
  id: string
  /** epoch ms */
  time: number
  level: LogLevel
  category: LogCategory
  messageKey: string
  /** 要先翻譯再帶入 {{name}} 的 i18n key，例如警報欄位名稱 */
  subjectKey?: string
  /** 直接帶入 {{name}} 的原始文字，例如後端錯誤訊息 */
  text?: string
}

export type NewLogEntry = Omit<LogEntry, 'id' | 'time'>

const STORAGE_KEY = 'agvui.eventLog.v1'
/** 最多保留筆數，超過從最舊的丟 */
export const MAX_LOG_ENTRIES = 1000

function load(): LogEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as LogEntry[]).slice(-MAX_LOG_ENTRIES) : []
  } catch {
    return []
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // 無痕模式或容量滿：只留在記憶體
  }
}

/** 舊 → 新；每次變動都換新陣列，給 useSyncExternalStore 比對 */
let entries: LogEntry[] = load()
let seq = 0
const listeners = new Set<() => void>()

function commit(next: LogEntry[]) {
  entries = next
  save()
  listeners.forEach((l) => l())
}

export const eventLogStore = {
  getSnapshot: (): LogEntry[] => entries,

  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  append(items: NewLogEntry[]) {
    if (items.length === 0) return
    const time = Date.now()
    const next = [...entries, ...items.map((item) => ({ ...item, id: `${time}-${seq++}`, time }))]
    commit(next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next)
  },

  clear() {
    commit([])
  },
}

// 同一台電腦開多個分頁時，同步其他分頁寫入的紀錄
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return
  entries = load()
  listeners.forEach((l) => l())
})
