import type {
  ErrorInfo,
  IoInfo,
  MissionActionFeedback,
  MissionActionFeedbackMsg,
  MissionFeedback,
  MissionReadStatus,
  MissionWriteStatus,
  Odometry,
  RobotPose,
  StdBool,
  StdFloat32,
  Float32MultiArray,
  WebScan2D,
  StdString,
  VehicleStatus,
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
  /** rosbridge 傳輸壓縮；數值陣列多的 topic 用 'cbor'，直接收二進位 typed array */
  compression?: 'none' | 'cbor'
}

/** 解析 std_msgs/String 裡的 JSON，壞掉的訊息回傳 undefined（略過，不覆蓋舊值） */
/**
 * action_process 可能是字串 "F"，也可能是帶參數的物件 { fork_height: { is_define_height, height } }。
 * 統一轉成 { action: 代碼字串, params: 參數物件 }，避免 UI 對物件呼叫 .trim() 而 crash。
 */
export function normalizeActionProcess(v: unknown): { action: string; params?: Record<string, unknown> } {
  if (typeof v === 'string') return { action: v.trim() }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const [key] = Object.keys(v)
    if (key == null) return { action: '' }
    const params = (v as Record<string, unknown>)[key]
    return {
      action: key.trim(),
      params: params && typeof params === 'object' ? (params as Record<string, unknown>) : undefined,
    }
  }
  return { action: v == null ? '' : String(v) }
}

function withAction<T extends { action_process?: unknown }>(obj: T): T {
  const { action, params } = normalizeActionProcess(obj.action_process)
  return { ...obj, action_process: action, action_params: params }
}

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

/** 與車端 kenmec_fork_planner/param/pose_listen.yaml 的 `stable` 一致 */
export const NDT_STABLE_SCORE = 3

/** 發布用 topic */
export const PUB_TOPICS = {
  /** 同 RViz「2D Pose Estimate」：ndt_localizer 重新定位；無任務時 fleet_action 會重新綁定站點 */
  initialPose: { name: '/initialpose', messageType: 'geometry_msgs/PoseWithCovarianceStamped' },
} as const

export const TOPICS = {
  missionReadStatus: {
    name: '/mission_control/read/status',
    messageType: 'std_msgs/String',
    parse: (raw) => {
      const r = parseJsonString<MissionReadStatus>(raw)
      return r?.info ? { ...r, info: withAction(r.info) } : r
    },
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

  vehicleStatus: {
    name: '/kenmec_fork/vehicle_status',
    messageType: 'std_msgs/String',
    parse: (raw) => parseJsonString<VehicleStatus>(raw),
  } satisfies TopicDef<StdString, VehicleStatus | undefined>,

  /** actionlib feedback：feedback 若包成 feedback_json 字串就先解析，解析失敗的訊息略過 */
  hasMission: {
    name: '/kenmec_fork/has_mission',
    messageType: 'std_msgs/Bool',
    parse: (raw) => raw.data,
  } satisfies TopicDef<StdBool, boolean>,

  missionFeedback: {
    name: '/kenmec_fork/fleet_manager/mission/feedback',
    messageType: 'kenmec_fork_socket/MissionActionFeedback',
    parse: (raw): MissionActionFeedback | undefined => {
      const json = raw.feedback.feedback_json
      const feedback =
        typeof json === 'string' ? parseJsonString<MissionFeedback>({ data: json }) : (raw.feedback as MissionFeedback)
      return feedback ? { ...raw, feedback: withAction(feedback) } : undefined
    },
  } satisfies TopicDef<MissionActionFeedbackMsg, MissionActionFeedback | undefined>,

  errorInfo: {
    name: '/kenmec_fork/error_info',
    messageType: 'std_msgs/String',
    parse: (raw) => parseJsonString<ErrorInfo>(raw),
  } satisfies TopicDef<StdString, ErrorInfo | undefined>,

  /** ndt_localizer 比對分數：越高越好，低於 NDT_STABLE_SCORE 視為定位異常 */
  transformProbability: {
    name: '/transform_probability',
    messageType: 'std_msgs/Float32',
    throttleRate: 500,
    parse: (raw) => raw.data,
  } satisfies TopicDef<StdFloat32, number>,

  /** pos_listener_application 的定位判斷：true = 定位異常 / 漂移 */
  localizationCheck: {
    name: '/kenmec_fork/localization_check',
    messageType: 'std_msgs/Bool',
    throttleRate: 500,
    parse: (raw) => raw.data,
  } satisfies TopicDef<StdBool, boolean>,

  /** 車端 web_scan_2d 節點：已降採樣、轉到 map frame 的 2D 點 [x0, y0, x1, y1, ...] */
  webScan2d: {
    name: '/kenmec_fork/web_scan_2d',
    messageType: 'std_msgs/Float32MultiArray',
    compression: 'cbor',
    parse: (raw): WebScan2D | undefined => {
      // cbor 時是 Float32Array，JSON 時是 number[]
      const points = raw.data instanceof Float32Array ? raw.data : Float32Array.from(raw.data)
      if (points.length % 2 !== 0) return undefined
      return { points, frame: raw.layout?.dim?.[0]?.label || 'map', receivedAt: Date.now() }
    },
  } satisfies TopicDef<Float32MultiArray, WebScan2D | undefined>,

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
