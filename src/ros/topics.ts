import type {
  ErrorInfo,
  IoInfo,
  MissionReadStatus,
  MissionWriteStatus,
  Odometry,
  RobotPose,
  StdString,
} from './types'

/** 預設 rosbridge 位址：可用 VITE_ROSBRIDGE_URL 覆蓋，否則連到開網頁的那台主機的 9090 */
export const DEFAULT_ROSBRIDGE_URL: string =
  import.meta.env.VITE_ROSBRIDGE_URL ?? `ws://${window.location.hostname || 'localhost'}:9090`

export const DEFAULT_RECONNECT_DELAY_MS = 1000

/** 一個 topic 的完整描述：名稱、型別、以及把原始訊息轉成 UI 用資料的 parser */
export interface TopicDef<Raw, T> {
  name: string
  messageType: string
  parse: (raw: Raw) => T
  /** rosbridge 端節流（ms），0 = 不節流 */
  throttleRate?: number
}

/** 解析 std_msgs/String 裡的 JSON，壞掉的訊息回傳 undefined（略過，不覆蓋舊值） */
function parseJsonString<T>(raw: StdString): T | undefined {
  try {
    return JSON.parse(raw.data) as T
  } catch (err) {
    console.warn('[ros] JSON parse failed:', raw.data, err)
    return undefined
  }
}

export function quaternionToYaw({ x, y, z, w }: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
}

export const TOPICS = {
  missionReadStatus: {
    name: '/mission_control/read/status',
    messageType: 'std_msgs/String',
    parse: (raw) => parseJsonString<MissionReadStatus>(raw),
  } satisfies TopicDef<StdString, MissionReadStatus | undefined>,

  missionWriteStatus: {
    name: '/mission_control/write/status',
    messageType: 'std_msgs/String',
    parse: (raw) => parseJsonString<MissionWriteStatus>(raw),
  } satisfies TopicDef<StdString, MissionWriteStatus | undefined>,

  ioInfo: {
    name: '/kenmec_fork/io_info',
    messageType: 'std_msgs/String',
    parse: (raw) => parseJsonString<IoInfo>(raw),
  } satisfies TopicDef<StdString, IoInfo | undefined>,

  errorInfo: {
    name: '/kenmec_fork/error_info',
    messageType: 'std_msgs/String',
    parse: (raw) => parseJsonString<ErrorInfo>(raw),
  } satisfies TopicDef<StdString, ErrorInfo | undefined>,

  odom: {
    name: '/hdl_odom',
    messageType: 'nav_msgs/Odometry',
    throttleRate: 100,
    parse: (raw): RobotPose => {
      const { position, orientation } = raw.pose.pose
      return { x: position.x, y: position.y, yaw: quaternionToYaw(orientation), orientation }
    },
  } satisfies TopicDef<Odometry, RobotPose>,
} as const
