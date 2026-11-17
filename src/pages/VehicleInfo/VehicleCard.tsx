import { ClockCircleOutlined, ThunderboltFilled, WarningOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import Clock from '../../components/Clock'
import { useFeedbackFromAction, useHasMission, useIoInfo, useMissionReadStatus, useRos } from '../../hooks/useRos'
import type { VehicleStatus } from '../../ros/types'
import { batteryColor } from '../../utils/battery'
import { ForkliftAnimation } from './ForkliftAnimation'

/**
 * 車輛卡片：左邊車輛圖示，右邊模式、任務狀態、電量。
 * 電量來自 io_info（vehicle_status 只有「是否低於 35%」）。
 */
export function VehicleCard({ vehicle }: { vehicle: VehicleStatus | null }) {
  const { t } = useTranslation()
  const { connected } = useRos()
  const io = useIoInfo()
  const hasMission = useHasMission()
  const feedback = useFeedbackFromAction()
  const readStatus = useMissionReadStatus()

  // 目前動作：優先用 mission feedback，收不到時退回 read/status 的 info.action_process
  const action = (feedback?.feedback.action_process || readStatus?.info?.action_process || '').trim() || null
  const actionLabel = action ? t(`mission.actions.${action}`, { defaultValue: action }) : undefined

  const battery = io?.battery_info?.battery ?? null
  const charging = io ? Number(io.battery_info?.charging) !== 0 : false
  const pct = battery == null ? 0 : Math.max(0, Math.min(100, battery))
  const color = battery == null ? undefined : batteryColor(pct)
  const isAuto = vehicle ? vehicle.auto_mode_enabled : null

  return (
    <div className="vc">
      <ForkliftAnimation
        action={action}
        label={actionLabel}
        // ROS 斷線或 vehicle_status / has_mission 還沒進來 → 反灰；連上且沒任務 → 微跳動
        offline={!connected || vehicle == null || hasMission == null}
        idle={hasMission === false}
      />

      <div className="vc-body">
        <div className="vc-time">
          <ClockCircleOutlined />
          <Clock />
        </div>

        <div className="vc-row">
          <span className={`vc-chip ${isAuto === false ? 'is-warning' : isAuto ? 'is-primary' : ''}`}>
            <span className="vc-chip-label">{t('vehicle.card.mode')}</span>
            {isAuto == null ? '—' : t(isAuto ? 'status.auto' : 'status.maintenance')}
          </span>
          <span className={`vc-chip ${hasMission ? 'is-success' : ''}`} title={actionLabel}>
            <span className="vc-chip-label">{t('vehicle.card.mission')}</span>
            {hasMission && <span className="vc-dot" />}
            {hasMission == null ? '—' : t(hasMission ? 'vehicle.card.onMission' : 'vehicle.card.idle')}
            {/* action_process 原字串；滑過整個 tag 顯示中文說明 */}
            {action && <span className="vc-action">{action}</span>}
          </span>
        </div>

        <div className="vc-battery">
          <span className="vc-battery-label">{t('vehicle.card.battery')}</span>
          {/* 電池外型：本體 + 正極頭 */}
          <span
            className="vc-batt"
            role="meter"
            aria-label={t('vehicle.card.battery')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={battery ?? undefined}
          >
            <span className="vc-batt-body">
              <span
                className={`vc-batt-fill ${charging ? 'is-charging' : ''}`}
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </span>
            <span className="vc-batt-cap" />
          </span>
          <span className="vc-battery-value" style={{ color }}>
            {battery == null ? '—' : battery.toFixed(0)}
            <small>%</small>
          </span>
          {charging && (
            <ThunderboltFilled className="vc-charging" aria-label={t('vehicle.card.charging')} />
          )}
        </div>

        {vehicle?.abnormal_feedback && (
          <div className="vc-abnormal">
            <WarningOutlined /> {t('vehicle.abnormalFeedback', { msg: vehicle.abnormal_feedback })}
          </div>
        )}
      </div>
    </div>
  )
}
