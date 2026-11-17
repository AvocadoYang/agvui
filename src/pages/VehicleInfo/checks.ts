import type { VehicleStatus } from '../../ros/types'

/**
 * vehicle_status 的檢查項目（/kenmec_fork/vehicle_status）
 * 標籤 = vehicle.checks.<key>（例：擋板已開啟），沒通過時的說明 = vehicle.checksOff.<key>（例：擋板未開啟）
 */
export interface CheckDef {
  key: string
  ok: (s: VehicleStatus) => boolean
}

/** 定位狀況：顯示在車輛卡片的 tag 上 */
export const POSITION_CHECK: CheckDef = { key: 'position', ok: (s) => s.vehicle_connected_and_position_correct }

/** 與外部設備的連線 / 啟用狀況：顯示在下方的狀態格 */
export const DEVICE_CHECKS: CheckDef[] = [
  { key: 'chargingStation', ok: (s) => s.charging_station_connected },
  { key: 'firmware', ok: (s) => s.firmware_status_connected },
  { key: 'lidar2dFront', ok: (s) => !!s.front_2d_lidar?.enable_2d_lidar },
  { key: 'lidar2dRear', ok: (s) => !!s.rear_2d_lidar?.enable_2d_lidar },
  { key: 'lidar3d', ok: (s) => s.front_3d_lidar_enabled },
  { key: 'forkTip', ok: (s) => !!s.fork_tip?.enable_tip },
  { key: 'baffle', ok: (s) => !!s.baffle?.enable_baffle },
  { key: 'eStop', ok: (s) => s.e_stop_enabled },
  { key: 'antiCollision', ok: (s) => s.anti_collision_strip_enabled },
  { key: 'batteryTemp', ok: (s) => s.battery_temperature_normal },
]

/** 沒通過的檢查項目（含定位），車輛圖示警示用 */
export const failedChecks = (s: VehicleStatus | null | undefined) =>
  s ? [POSITION_CHECK, ...DEVICE_CHECKS].filter((c) => !c.ok(s)) : []
