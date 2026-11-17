import type { ReactNode } from 'react'
import { Alert, Badge, Card, Empty, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, MinusCircleOutlined, WarningOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useRos, useVehicleStatus } from '../../hooks/useRos'
import { TOPICS } from '../../ros/topics'
import type { VehicleStatus } from '../../ros/types'
import './VehicleInfoPage.css'

/* ---------- 設備連線狀態 ---------- */

interface CheckDef {
  key: string
  labelKey: string
  /** 正常 / 異常時顯示的文字 */
  okKey: string
  badKey: string
  ok: (s: VehicleStatus) => boolean
  /** 額外的小字說明（例如 2D 光達的前 / 後方） */
  detail?: (s: VehicleStatus) => { labelKey: string; on: boolean }[]
}

const CHECKS: CheckDef[] = [
  {
    key: 'position',
    labelKey: 'vehicle.checks.position',
    okKey: 'vehicle.values.correct',
    badKey: 'vehicle.values.incorrect',
    ok: (s) => s.vehicle_connected_and_position_correct,
  },
  {
    key: 'chargingStation',
    labelKey: 'vehicle.checks.chargingStation',
    okKey: 'vehicle.values.connected',
    badKey: 'vehicle.values.disconnected',
    ok: (s) => s.charging_station_connected,
  },
  {
    key: 'firmware',
    labelKey: 'vehicle.checks.firmware',
    okKey: 'vehicle.values.connected',
    badKey: 'vehicle.values.disconnected',
    ok: (s) => s.firmware_status_connected,
  },
  {
    key: 'lidar2d',
    labelKey: 'vehicle.checks.lidar2d',
    okKey: 'vehicle.values.started',
    badKey: 'vehicle.values.notStarted',
    ok: (s) => !!s.front_2d_lidar?.enable_2d_lidar && !!s.rear_2d_lidar?.enable_2d_lidar,
    detail: (s) => [
      { labelKey: 'vehicle.front', on: !!s.front_2d_lidar?.enable_2d_lidar },
      { labelKey: 'vehicle.rear', on: !!s.rear_2d_lidar?.enable_2d_lidar },
    ],
  },
  {
    key: 'lidar3d',
    labelKey: 'vehicle.checks.lidar3d',
    okKey: 'vehicle.values.started',
    badKey: 'vehicle.values.notStarted',
    ok: (s) => s.front_3d_lidar_enabled,
  },
  {
    key: 'forkTip',
    labelKey: 'vehicle.checks.forkTip',
    okKey: 'vehicle.values.started',
    badKey: 'vehicle.values.notStarted',
    ok: (s) => !!s.fork_tip?.enable_tip,
  },
  {
    key: 'baffle',
    labelKey: 'vehicle.checks.baffle',
    okKey: 'vehicle.values.opened',
    badKey: 'vehicle.values.notOpened',
    ok: (s) => !!s.baffle?.enable_baffle,
  },
  {
    key: 'eStop',
    labelKey: 'vehicle.checks.eStop',
    okKey: 'vehicle.values.started',
    badKey: 'vehicle.values.notStarted',
    ok: (s) => s.e_stop_enabled,
  },
  {
    key: 'antiCollision',
    labelKey: 'vehicle.checks.antiCollision',
    okKey: 'vehicle.values.started',
    badKey: 'vehicle.values.notStarted',
    ok: (s) => s.anti_collision_strip_enabled,
  },
  {
    key: 'batteryTemp',
    labelKey: 'vehicle.checks.batteryTemp',
    okKey: 'vehicle.values.normal',
    badKey: 'vehicle.values.abnormal',
    ok: (s) => s.battery_temperature_normal,
  },
]

function CheckTile({ def, status }: { def: CheckDef; status: VehicleStatus | null }) {
  const { t } = useTranslation()
  const ok = status ? def.ok(status) : null

  let icon: ReactNode = <MinusCircleOutlined />
  if (ok === true) icon = <CheckCircleFilled />
  if (ok === false) icon = <CloseCircleFilled />

  return (
    <div className={`vi-check ${ok === true ? 'is-ok' : ok === false ? 'is-bad' : ''}`}>
      <span className="vi-check-icon">{icon}</span>
      <div className="vi-check-body">
        <span className="vi-check-label">{t(def.labelKey)}</span>
        <span className="vi-check-value">{ok == null ? '—' : t(ok ? def.okKey : def.badKey)}</span>
        {status && def.detail && (
          <span className="vi-check-detail">
            {def.detail(status).map((d) => (
              <span key={d.labelKey} className={d.on ? 'is-on' : 'is-off'}>
                {t(d.labelKey)} {t(d.on ? 'status.open' : 'status.close')}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------- 頁面 ---------- */

export default function VehicleInfoPage() {
  const { t } = useTranslation()
  const { connected } = useRos()
  const vehicle = useVehicleStatus()

  const waiting = (topic: string) => (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={connected ? t('vehicle.waitingData', { topic }) : t('vehicle.rosNotConnected')}
    />
  )

  return (
    <div className="vi-page">
      <header className="vi-header">
        <Typography.Title level={4} className="vi-title">
          {t('vehicle.title')}
        </Typography.Title>
      </header>

      {/* /kenmec_fork/vehicle_status */}
      <Card
        size="small"
        title={t('vehicle.status.title')}
        className="vi-card"
        extra={
          <Badge
            status={!connected ? 'error' : vehicle ? 'success' : 'warning'}
            text={t(!connected ? 'status.disconnected' : vehicle ? 'status.connected' : 'vehicle.status.waiting')}
          />
        }
      >
        {vehicle?.abnormal_feedback && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            className="vi-alert"
            title={t('vehicle.abnormalFeedback', {
              msg: vehicle.abnormal_feedback,
            })}
          />
        )}
        {!vehicle && waiting(TOPICS.vehicleStatus.name)}
        <div className="vi-checks">
          {CHECKS.map((def) => (
            <CheckTile key={def.key} def={def} status={vehicle} />
          ))}
        </div>
      </Card>
    </div>
  )
}
