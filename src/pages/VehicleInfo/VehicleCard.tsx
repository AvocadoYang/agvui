import { ClockCircleOutlined, ExclamationCircleFilled, ThunderboltFilled, WarningOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import Clock from '../../components/Clock'
import {
  useErrorInfo,
  useFeedbackFromAction,
  useHasMission,
  useIoInfo,
  useMissionReadStatus,
  useMissionWriteStatus,
  useRos,
} from '../../hooks/useRos'
import type { VehicleStatus } from '../../ros/types'
import { batteryColor } from '../../utils/battery'
import { errorWarnings } from '../../utils/errorInfo'
import { DEVICE_CHECKS, failedChecks, POSITION_CHECK } from './checks'
import { ForkliftAnimation } from './ForkliftAnimation'

/** 移動類動作：顯示目的地 */
const MOVE_ACTIONS = new Set(['F', 'B', 'FH', 'BH'])

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
  const errorInfo = useErrorInfo()
  const writeStatus = useMissionWriteStatus()

  // 目前動作：優先用 mission feedback，收不到時退回 read/status 的 info.action_process
  // 後端任務結束後不會清空 action_process，所以只在 has_mission = true 時才採用
  const action = hasMission
    ? (feedback?.feedback.action_process || readStatus?.info?.action_process || '').trim() || null
    : null
  // 移動中 → 目的地 = write/status 的 action.mission_status.end
  const destination =
    action && MOVE_ACTIONS.has(action) ? writeStatus?.action?.mission_status?.end?.trim() || null : null
  const actionLabel = action ? t(`mission.actions.${action}`, { defaultValue: action }) : undefined

  const battery = io?.battery_info?.battery ?? null
  const charging = io ? Number(io.battery_info?.charging) !== 0 : false
  const pct = battery == null ? 0 : Math.max(0, Math.min(100, battery))
  const color = battery == null ? undefined : batteryColor(pct)
  const isAuto = vehicle ? vehicle.auto_mode_enabled : null
  const positionOk = vehicle ? POSITION_CHECK.ok(vehicle) : null
  const offline = !connected || vehicle == null || hasMission == null

  // 警示：設備連線狀態有異常 + error_info 的 warning + 任務 warning（重複的訊息只留一筆）
  // 紅（優先）：設備連線異常、異常回饋；黃：error_info / 任務的 warning
  const missionWarning = feedback?.feedback.warning_msg || readStatus?.info?.warning_msg
  const errors = [
    ...failedChecks(vehicle).map((c) => t(`vehicle.checksOff.${c.key}`)),
    ...(vehicle?.abnormal_feedback ? [vehicle.abnormal_feedback] : []),
  ]
  const warnItems = [
    ...errorWarnings(errorInfo),
    ...(missionWarning ? [{ id: null, msg: missionWarning }] : []),
  ].filter((w, i, all) => all.findIndex((x) => x.msg === w.msg) === i)
  const alertLevel = offline ? null : errors.length ? 'error' : warnItems.length ? 'warning' : null
  // 異常回饋欄：下方 10 個連線設備中狀態異常的項目
  const deviceIssues = vehicle ? DEVICE_CHECKS.filter((c) => !c.ok(vehicle)).map((c) => t(`vehicle.checksOff.${c.key}`)) : []
  const issues = [...new Set([...errors, ...warnItems.map((w) => (w.id != null ? `[${w.id}] ${w.msg}` : w.msg))])]

  return (
    <>
      {/* 左：車輛卡片；右：error_info 的 warning 清單（手機上改成上下排） */}
      <div className="vc-top">
        <div className="vc">
          <ForkliftAnimation
            action={action}
            label={actionLabel}
            // ROS 斷線或 vehicle_status / has_mission 還沒進來 → 反灰；連上且沒任務 → 微跳動
            offline={offline}
            idle={hasMission === false}
            alertLevel={alertLevel}
            warnings={issues}
            destination={destination}
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
              <span className={`vc-chip ${positionOk === false ? 'is-error' : positionOk ? 'is-success' : ''}`}>
                <span className="vc-chip-label">{t('vehicle.card.position')}</span>
                {positionOk == null ? '—' : t(positionOk ? 'vehicle.card.positionOk' : 'vehicle.card.positionBad')}
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
              {charging && <ThunderboltFilled className="vc-charging" aria-label={t('vehicle.card.charging')} />}
            </div>
          </div>
        </div>

        <section
          className={`vc-warn-panel ${warnItems.length ? 'has-items' : ''}`}
          aria-label={t('vehicle.card.warningsTitle')}
        >
          <header className="vc-warn-head">
            <ExclamationCircleFilled className="vc-warn-head-icon" />
            {t('vehicle.card.warningsTitle')}
            {warnItems.length > 0 && <span className="vc-warn-count">{warnItems.length}</span>}
          </header>
          {offline ? (
            <p className="vc-warn-empty">—</p>
          ) : warnItems.length === 0 ? (
            <p className="vc-warn-empty">{t('vehicle.card.noWarnings')}</p>
          ) : (
            // 清單在面板內捲動，不會把面板撐得比車輛卡片高
            <ol className="vc-warnings" aria-live="polite">
              {warnItems.map((w, i) => (
                <li key={`${w.id}-${i}`}>
                  {w.id != null && <span className="vc-warning-id">{w.id}</span>}
                  <span className="vc-warning-msg">{w.msg}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* 異常回饋：車輛卡片外、下方靠左，與設備狀態格（定位狀況）左緣對齊 */}
      {deviceIssues.length > 0 && (
        <div className="vc-abnormal" role="alert">
          <WarningOutlined /> {t('vehicle.abnormalFeedback', { msg: deviceIssues.join(t('vehicle.listSeparator')) })}
        </div>
      )}
    </>
  )
}
