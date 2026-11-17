/**
 * ROS 訊息型別定義（欄位參考自 AGV_UI/src/Component/ForkState/RobotState.jsx、IOState.jsx）
 * JSON 字串 topic 的內容由 ROS 端決定，這裡只描述 UI 已知會用到的欄位，
 * 其餘欄位一律保留在物件上（index signature），避免後端新增欄位時型別報錯。
 */

/* ---------- 標準 ROS 訊息 ---------- */

export interface StdString {
  data: string
}

export interface StdBool {
  data: boolean
}

export interface StdFloat32 {
  data: number
}

export interface Float32MultiArray {
  layout?: { dim?: { label: string; size: number; stride: number }[]; data_offset?: number }
  /** rosbridge 用 cbor 傳時是 Float32Array，JSON 時是 number[] */
  data: number[] | Float32Array
}

export interface Vector3 {
  x: number
  y: number
  z: number
}

export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

/** ROS1 用 secs/nsecs，ROS2 用 sec/nanosec */
export interface RosTime {
  sec?: number
  secs?: number
  nanosec?: number
  nsecs?: number
}

export interface Header {
  seq?: number
  frame_id: string
  stamp: RosTime
}

/** actionlib_msgs/GoalStatus.status */
export const GoalStatusCode = {
  PENDING: 0,
  ACTIVE: 1,
  PREEMPTED: 2,
  SUCCEEDED: 3,
  ABORTED: 4,
  REJECTED: 5,
  PREEMPTING: 6,
  RECALLING: 7,
  RECALLED: 8,
  LOST: 9,
} as const
export type GoalStatusCode = (typeof GoalStatusCode)[keyof typeof GoalStatusCode]

/** actionlib_msgs/GoalStatus */
export interface GoalStatus {
  goal_id: { stamp: RosTime; id: string }
  status: GoalStatusCode
  text: string
}

export interface Odometry {
  header: Header
  child_frame_id: string
  pose: { pose: { position: Vector3; orientation: Quaternion }; covariance: number[] }
  twist: { twist: { linear: Vector3; angular: Vector3 }; covariance: number[] }
}

/* ---------- /mission_control/read/status ---------- */

export interface MissionReadStatus {
  read: {
    is_arrive: boolean
    is_locations: number[]
    checked_locations: unknown[]
    is_drop_goods: boolean
    is_dropping_goods: boolean
    is_take_goods: boolean
    is_taking_goods: boolean
    with_goods: boolean
    is_finished_mission: boolean
    isReadyCharge: boolean
    [key: string]: unknown
  }
  info: {
    amr_id: number | string | null
    activated: number
    is_running: boolean
    warning_msg: string
    warning_id: number
    warning: number
    debug: string
    task_process: number
    action_process: string
    charging: boolean
    cargo_status: number
    heartbeat: number
    error: string
    [key: string]: unknown
  }
  check: {
    isCancelSiganl: boolean
    breakSignal: boolean
    last_action_status: string
    last_charge_status: boolean
    last_write_status: MissionOperation
    [key: string]: unknown
  }
  [key: string]: unknown
}

/* ---------- /mission_control/write/status ---------- */

export interface MissionOperation {
  type: string
  control: string[]
  wait: number
  is_define_id: boolean
  id: number
  is_define_yaw: boolean
  multiLoc: unknown[]
  selectBy: unknown
  yaw: number
  tolerance: number
  lookahead: number
  roughly_pass: boolean
  from: number
  to: number
  max_speed: number
  hasCargoToProcess: boolean
  [key: string]: unknown
}

export interface MissionWriteStatus {
  write: {
    send_mission: number[]
    check_mission: unknown[]
    start_mission: boolean
    cancel_mission: boolean
    pause: boolean
    canTakeGoods: boolean
    canDropGoods: boolean
    heartbeat: number
    charge_mission: boolean
    [key: string]: unknown
  }
  region: {
    regionType: string
    max_height: number
    min_height: number
    max_speed: number
  }
  action: {
    operation: MissionOperation
    io: {
      fork: { is_define_height: boolean; execute: boolean; height: number; move: number; shift: number; tilt: number }
      camera: { execute: boolean; config: number; modify_dis: number }
    }
    cargo_limit: { load: number; offload: number }
    mission_status: {
      feedback_id: string
      name: string[]
      start: string
      end: string
      bookBlock: string[] | null
      load_level?: number | null
      offload_level?: number | null
    }
  }
  [key: string]: unknown
}

/* ---------- /kenmec_fork/io_info ---------- */

export interface IoInfo {
  heartBeatSignal: number | boolean
  error_code: number
  /** 0 = 手動, 非 0 = 自動 */
  manual_mode: number
  recovery: number
  enable_reboot: number
  emergency_stop: number
  bumper: number
  enforce_charge: number

  enable_tip: number | boolean
  tip_left: number
  tip_right: number
  enable_baffle?: number | boolean
  baffle_left: number
  baffle_right: number

  enable_ultrasound: number | boolean
  enable_ultrasound_front: number | boolean
  enable_ultrasound_side: number | boolean
  ultrasound: unknown[]

  battery_info: {
    set_charge: number
    battery: number
    voltage: number
    current: number
    charging: number
  }
  lidar: {
    enable_2d_lidar: number | boolean
    front_2d_layer: number
    obstacle_2d_signal: number
    obstacle_2d_left_layer?: string
    obstacle_2d_right_layer?: string
    enable_rear_2d_lidar?: number | boolean
    obstacle_rear_2d_signal: number
    obstacle_3d_signal: number
  }
  twist: {
    set_linear_x: number
    set_angular_z: number
    odom_linear_x: number
    odom_angular_z: number
    [key: string]: number
  }
  fork: {
    set_height: number
    current_height: number
    set_clamp: number
    current_clamp: number
  }
  [key: string]: unknown
}

/* ---------- /kenmec_fork/vehicle_status ---------- */
/* 欄位對照見 src/cheat_sheet/kenmec_fork_vehicle_status.jsonc，障礙物類欄位 true = 偵測到障礙物 */

export interface VehicleStatus {
  /** 車輛是否連線、位置是否正確 */
  vehicle_connected_and_position_correct: boolean
  /** 充電站是否連線 */
  charging_station_connected: boolean
  /** 韌體狀態是否連線 */
  firmware_status_connected: boolean
  front_2d_lidar: {
    enable_2d_lidar: boolean
    obstacle_2d_left: boolean
    obstacle_2d_right: boolean
    front_2d_layer: number
  }
  /** 前方 3D 避障光達是否開啟 */
  front_3d_lidar_enabled: boolean
  rear_2d_lidar: {
    enable_2d_lidar: boolean
    obstacle_2d_rear: boolean
    rear_2d_layer: number
    /** true = 開啟 mute */
    mute_status: boolean
  }
  fork_tip: {
    enable_tip: boolean
    left_tip: boolean
    right_tip: boolean
  }
  baffle: {
    enable_baffle: boolean
    baffle_left: number
    baffle_right: number
  }
  /** 防撞邊條是否開啟 */
  anti_collision_strip_enabled: boolean
  /** E-Stop 是否開啟 */
  e_stop_enabled: boolean
  /** 是否為自動模式 */
  auto_mode_enabled: boolean
  /** 電量是否低於 35% */
  battery_below_35_percent: boolean
  /** 電池工作溫度是否正常 */
  battery_temperature_normal: boolean
  /** 異常回饋，空字串 = 無異常 */
  abnormal_feedback: string
  [key: string]: unknown
}

/* ---------- /kenmec_fork/fleet_manager/mission/feedback ---------- */



/**
 * move : F 前進, B後退, FH 前進加枒杈調整, BH 後退加枒杈調整
 * spin : S 選轉, SH 選轉加枒杈調整
 * fork : tilt 調整傾角, clamp 調整夾具, fork_height 調整高度
 * cargo: verity_cargo 影像貨物分類, cargo_limit 貨物高度檢測
 */

/** feedback 內容 */
export interface MissionFeedback {
  task_process: number
  navigation_status: boolean
  warning: number
  warning_id: number
  warning_msg: string
  is_running: boolean
  cancel_task: boolean
  action_process: string // 車輛正在執行的動作 (即時的)
  task_status: boolean
  [key: string]: unknown
}

/** kenmec_fork_socket/MissionActionFeedback（useFeedbackFromAction 回傳此形狀） */
export interface MissionActionFeedback {
  header: Header
  status: GoalStatus
  feedback: MissionFeedback
}

/**
 * 原始訊息：feedback 可能直接是物件，
 * 也可能依 Mission.action 定義包成 { feedback_json: string }，兩種都接受。
 */
export interface MissionActionFeedbackMsg extends Omit<MissionActionFeedback, 'feedback'> {
  feedback: MissionFeedback | { feedback_json: string }
}

/* ---------- /kenmec_fork/error_info ---------- */

/**
 * 舊版 UI 直接讀 error_info.warning_id / warning_msg，
 * 但預設值寫成 { data: { warning_id: [], warning_msg: [] } }，兩種形狀都保留。
 */
export interface ErrorInfo {
  warning_id?: number | number[]
  warning_msg?: string | string[]
  data?: { warning_id: number[]; warning_msg: string[] }
  [key: string]: unknown
}

/* ---------- /hdl_odom 整理後 ---------- */

export interface RobotPose {
  x: number
  y: number
  /** 由四元數換算的 yaw（弧度） */
  yaw: number
  orientation: Quaternion
}

/* ---------- /initialpose（geometry_msgs/PoseWithCovarianceStamped） ---------- */

export interface PoseWithCovarianceStamped {
  header: Header
  pose: { pose: { position: Vector3; orientation: Quaternion }; covariance: number[] }
}

/* ---------- /kenmec_fork/web_scan_2d（車端 web_scan_2d 節點） ---------- */

export interface WebScan2D {
  /** map frame 下的 [x0, y0, x1, y1, ...]（公尺） */
  points: Float32Array
  frame: string
  /** 網頁收到的時間（ms） */
  receivedAt: number
}
