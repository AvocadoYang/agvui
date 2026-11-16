/**
 * ROS 訊息型別定義（欄位參考自 AGV_UI/src/Component/ForkState/RobotState.jsx、IOState.jsx）
 * JSON 字串 topic 的內容由 ROS 端決定，這裡只描述 UI 已知會用到的欄位，
 * 其餘欄位一律保留在物件上（index signature），避免後端新增欄位時型別報錯。
 */

/* ---------- 標準 ROS 訊息 ---------- */

export interface StdString {
  data: string
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

export interface Odometry {
  header: { frame_id: string; stamp: { sec?: number; secs?: number; nanosec?: number; nsecs?: number } }
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
    mission_status: { name: string[]; start: string; end: string }
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
