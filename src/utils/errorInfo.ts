import type { ErrorInfo } from '../ros/types'

export const toArray = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

export interface WarningItem {
  id: number | null
  msg: string
}

/** error_info 有兩種形狀（見 types.ts），統一成 { id, msg } 陣列，空訊息略過 */
export function errorWarnings(info: ErrorInfo | null | undefined): WarningItem[] {
  if (!info) return []
  const src = info.data ?? info
  const ids = toArray(src.warning_id)
  return toArray(src.warning_msg)
    .map((msg, i) => ({ id: ids[i] ?? null, msg: String(msg ?? '').trim() }))
    .filter((w) => w.msg !== '')
}

/** 「[id] 訊息」字串陣列（事件紀錄用） */
export const errorMessages = (info: ErrorInfo | null | undefined): string[] =>
  errorWarnings(info).map((w) => (w.id != null ? `[${w.id}] ${w.msg}` : w.msg))
