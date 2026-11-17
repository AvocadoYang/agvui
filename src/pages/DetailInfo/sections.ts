import type { IoInfo } from '../../ros/types'

/**
 * 每一列要顯示的值。用資料描述，由 <StatusValue> 統一決定顏色與文字：
 * - alarm：安全/偵測訊號，觸發時紅色
 * - switch：功能開關，開啟藍色、關閉灰色（關閉不代表異常）
 * - state：兩種狀態各自的文字與好壞
 * - text：純數值
 */
export type RowValue =
  | { kind: 'alarm'; triggered: boolean; note?: string }
  | { kind: 'switch'; on: boolean }
  | { kind: 'state'; ok: boolean; /** i18n key */ okText: string; /** i18n key */ badText: string; badTone?: 'error' | 'warning' }
  | { kind: 'text'; text: string; mono?: boolean }

export interface RowDef {
  key: string
  /** i18n key */
  labelKey: string
  value: (io: IoInfo) => RowValue
}

export type SectionKey = 'firmware' | 'sensor' | 'battery' | 'lidar' | 'speed' | 'fork'

/** 卡片內的子分類 */
export interface GroupDef {
  key: string
  /** i18n key */
  titleKey: string
  rows: RowDef[]
}

/** 一張卡片：一般列直接放 rows；需要再細分時用 groups（兩者可並存，rows 先顯示） */
export interface SectionDef {
  key: SectionKey
  /** i18n key */
  titleKey: string
  rows?: RowDef[]
  groups?: GroupDef[]
}

/** 攤平一張卡片內所有列（含子分類） */
export const sectionRows = (s: SectionDef): RowDef[] => [...(s.rows ?? []), ...(s.groups ?? []).flatMap((g) => g.rows)]

/* 後端欄位有時是 0/1、有時是 true/false，統一轉換 */
const isOn = (v: unknown) => v === true || Number(v) === 1
const isZero = (v: unknown) => Number(v) === 0
/** 警報判斷：欄位不存在時視為未觸發，避免缺欄位就誤報 */
const isTriggered = (v: unknown) => v != null && Number(v) !== 0

const alarm = (triggered: boolean, note?: string): RowValue => ({ kind: 'alarm', triggered, note })
const sw = (on: boolean): RowValue => ({ kind: 'switch', on })

const num = (v: unknown, digits?: number, unit = '') => {
  const n = Number(v)
  if (v == null || Number.isNaN(n)) return '—'
  return `${digits == null ? n : n.toFixed(digits)}${unit}`
}
const text = (t: string, mono = false): RowValue => ({ kind: 'text', text: t, mono })

/** 判斷邏輯照舊版 AGV_UI 的 IOState.jsx */
export const SECTIONS: SectionDef[] = [
  {
    key: 'firmware',
    titleKey: 'sections.firmware',
    rows: [
      {
        key: 'heartBeatSignal',
        labelKey: 'fields.heartBeatSignal',
        value: (io) => ({ kind: 'state', ok: isZero(io.heartBeatSignal), okText: 'status.connected', badText: 'status.disconnected' }),
      },
      {
        key: 'manual_mode',
        labelKey: 'fields.manual_mode',
        value: (io) => ({
          kind: 'state',
          ok: !isZero(io.manual_mode),
          okText: 'status.auto',
          badText: 'status.maintenance',
          badTone: 'warning',
        }),
      },
      { key: 'recovery', labelKey: 'fields.recovery', value: (io) => alarm(isTriggered(io.recovery)) },
      { key: 'enable_reboot', labelKey: 'fields.enable_reboot', value: (io) => alarm(isTriggered(io.enable_reboot)) },
      { key: 'emergency_stop', labelKey: 'fields.emergency_stop', value: (io) => alarm(isTriggered(io.emergency_stop)) },
      { key: 'bumper', labelKey: 'fields.bumper', value: (io) => alarm(isTriggered(io.bumper)) },
    ],
  },
  {
    key: 'sensor',
    titleKey: 'sections.sensor',
    groups: [
      {
        key: 'tip',
        titleKey: 'sections.tip',
        rows: [
          { key: 'enable_tip', labelKey: 'fields.enable_tip', value: (io) => sw(isOn(io.enable_tip)) },
          { key: 'tip_left', labelKey: 'fields.tip_left', value: (io) => alarm(isTriggered(io.tip_left)) },
          { key: 'tip_right', labelKey: 'fields.tip_right', value: (io) => alarm(isTriggered(io.tip_right)) },
        ],
      },
      {
        key: 'baffle',
        titleKey: 'sections.baffle',
        rows: [
          { key: 'enable_baffle', labelKey: 'fields.enable_baffle', value: (io) => sw(isOn(io.enable_baffle)) },
          { key: 'baffle_left', labelKey: 'fields.baffle_left', value: (io) => text(num(io.baffle_left, undefined, ' cm')) },
          { key: 'baffle_right', labelKey: 'fields.baffle_right', value: (io) => text(num(io.baffle_right, undefined, ' cm')) },
        ],
      },
      {
        key: 'ultrasound',
        titleKey: 'sections.ultrasound',
        rows: [
          { key: 'enable_ultrasound', labelKey: 'fields.enable_ultrasound', value: (io) => sw(isOn(io.enable_ultrasound)) },
          { key: 'enable_ultrasound_front', labelKey: 'fields.enable_ultrasound_front', value: (io) => sw(isOn(io.enable_ultrasound_front)) },
          { key: 'enable_ultrasound_side', labelKey: 'fields.enable_ultrasound_side', value: (io) => sw(isOn(io.enable_ultrasound_side)) },
          {
            key: 'ultrasound',
            labelKey: 'fields.ultrasound',
            value: (io) =>
              text(Array.isArray(io.ultrasound) ? io.ultrasound.join(' · ') : String(io.ultrasound ?? '—'), true),
          },
        ],
      },
    ],
  },
  {
    key: 'battery',
    titleKey: 'sections.battery',
    rows: [
      { key: 'charging', labelKey: 'fields.charging', value: (io) => sw(!isZero(io.battery_info?.charging)) },
      { key: 'enforce_charge', labelKey: 'fields.enforce_charge', value: (io) => sw(!isZero(io.enforce_charge)) },
      // 舊版邏輯：set_charge == 0 顯示「開啟」
      { key: 'set_charge', labelKey: 'fields.set_charge', value: (io) => sw(isZero(io.battery_info?.set_charge)) },
      { key: 'battery', labelKey: 'fields.battery', value: (io) => text(num(io.battery_info?.battery, 2, '%')) },
      { key: 'voltage', labelKey: 'fields.voltage', value: (io) => text(num(io.battery_info?.voltage, 2, ' V')) },
      { key: 'current', labelKey: 'fields.current', value: (io) => text(num(io.battery_info?.current, 2, ' A')) },
    ],
  },
  {
    key: 'lidar',
    titleKey: 'sections.lidar',
    rows: [
      { key: 'enable_2d_lidar', labelKey: 'fields.enable_2d_lidar', value: (io) => sw(isOn(io.lidar?.enable_2d_lidar)) },
      { key: 'front_2d_layer', labelKey: 'fields.front_2d_layer', value: (io) => text(num(io.lidar?.front_2d_layer)) },
      {
        key: 'obstacle_2d_signal',
        labelKey: 'fields.obstacle_2d_signal',
        value: (io) => alarm(isTriggered(io.lidar?.obstacle_2d_signal)),
      },
      {
        key: 'obstacle_2d_left_layer',
        labelKey: 'fields.obstacle_2d_left_layer',
        value: (io) => {
          const layer = io.lidar?.obstacle_2d_left_layer
          return alarm(layer === '111', `-${layer ?? 0}`)
        },
      },
      {
        key: 'obstacle_2d_right_layer',
        labelKey: 'fields.obstacle_2d_right_layer',
        value: (io) => {
          const layer = io.lidar?.obstacle_2d_right_layer
          return alarm(layer === '111', `-${layer ?? 0}`)
        },
      },
      { key: 'enable_rear_2d_lidar', labelKey: 'fields.enable_rear_2d_lidar', value: (io) => sw(isOn(io.lidar?.enable_rear_2d_lidar)) },
      {
        key: 'obstacle_rear_2d_signal',
        labelKey: 'fields.obstacle_rear_2d_signal',
        value: (io) => alarm(isTriggered(io.lidar?.obstacle_rear_2d_signal)),
      },
      {
        key: 'obstacle_3d_signal',
        labelKey: 'fields.obstacle_3d_signal',
        value: (io) => alarm(isTriggered(io.lidar?.obstacle_3d_signal)),
      },
    ],
  },
  {
    key: 'speed',
    titleKey: 'sections.speed',
    rows: [
      { key: 'set_linear_x', labelKey: 'fields.set_linear_x', value: (io) => text(num(io.twist?.set_linear_x, 2)) },
      { key: 'set_angular_z', labelKey: 'fields.set_angular_z', value: (io) => text(num(io.twist?.set_angular_z, 2)) },
      { key: 'odom_linear_x', labelKey: 'fields.odom_linear_x', value: (io) => text(num(io.twist?.odom_linear_x, 2)) },
      { key: 'odom_angular_z', labelKey: 'fields.odom_angular_z', value: (io) => text(num(io.twist?.odom_angular_z, 2)) },
    ],
  },
  {
    key: 'fork',
    titleKey: 'sections.fork',
    rows: [
      { key: 'set_height', labelKey: 'fields.set_height', value: (io) => text(num(io.fork?.set_height, undefined, ' mm')) },
      { key: 'current_height', labelKey: 'fields.current_height', value: (io) => text(num(io.fork?.current_height, undefined, ' mm')) },
      { key: 'set_clamp', labelKey: 'fields.set_clamp', value: (io) => text(num(io.fork?.set_clamp, undefined, ' mm')) },
      { key: 'current_clamp', labelKey: 'fields.current_clamp', value: (io) => text(num(io.fork?.current_clamp, undefined, ' mm')) },
    ],
  },
]

/** 目前正在觸發的警報 i18n key（給頁面頂部的提醒條用） */
export function activeAlarms(io: IoInfo): string[] {
  return SECTIONS.flatMap(sectionRows)
    .filter((row) => {
      const v = row.value(io)
      return v.kind === 'alarm' && v.triggered
    })
    .map((row) => row.labelKey)
}
