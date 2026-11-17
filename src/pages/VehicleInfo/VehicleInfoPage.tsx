import { Badge, Card, Empty, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useRos, useVehicleStatus } from '../../hooks/useRos'
import { TOPICS } from '../../ros/topics'
import type { VehicleStatus } from '../../ros/types'
import { VehicleCard } from './VehicleCard'
import './VehicleInfoPage.css'

/* ---------- 設備連線狀態 ---------- */

interface CheckDef {
  key: string
  ok: (s: VehicleStatus) => boolean
}

const CHECKS: CheckDef[] = [
  { key: 'position', ok: (s) => s.vehicle_connected_and_position_correct },
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

/** 狀態燈：綠 = 正常、紅 = 異常、灰 = 尚未收到資料 */
function CheckTile({ def, status }: { def: CheckDef; status: VehicleStatus | null }) {
  const { t } = useTranslation()
  const ok = status ? def.ok(status) : null
  const state = ok == null ? 'is-idle' : ok ? 'is-on' : 'is-off'
  const stateText = t(ok == null ? 'vehicle.status.waiting' : ok ? 'vehicle.light.ok' : 'vehicle.light.bad')

  return (
    <div className={`vi-check ${ok == null ? 'is-idle' : ''}`}>
      <span className={`vi-light ${state}`} role="img" aria-label={stateText} />
      <span className="vi-check-label">{t(`vehicle.checks.${def.key}`)}</span>
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
        {/* 車輛卡片：電量、模式、任務；有異常回饋時也顯示在卡片內 */}
        <VehicleCard vehicle={vehicle} />
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
