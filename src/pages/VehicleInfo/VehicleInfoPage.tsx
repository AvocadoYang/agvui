import { Badge, Card, Empty } from 'antd'
import { useTranslation } from 'react-i18next'
import { useRos, useVehicleStatus } from '../../hooks/useRos'
import { TOPICS } from '../../ros/topics'
import type { VehicleStatus } from '../../ros/types'
import { DEVICE_CHECKS, type CheckDef } from './checks'
import { VehicleCard } from './VehicleCard'
import './VehicleInfoPage.css'

/* ---------- 設備連線狀態 ---------- */

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
        {/* <Typography.Title level={4} className="vi-title">
          {t('vehicle.title')}
        </Typography.Title> */}
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
          {DEVICE_CHECKS.map((def) => (
            <CheckTile key={def.key} def={def} status={vehicle} />
          ))}
        </div>
      </Card>
    </div>
  )
}
