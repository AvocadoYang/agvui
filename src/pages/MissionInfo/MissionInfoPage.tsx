import { Alert, Card, Descriptions, Empty, Tag, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useFeedbackFromAction, useHasMission, useMissionWriteStatus, useRos } from '../../hooks/useRos'
import { TOPICS } from '../../ros/topics'
import type { MissionWriteStatus } from '../../ros/types'
import './MissionInfoPage.css'

type MissionState = 'idle' | 'running' | 'paused' | 'cancel'

const MISSION_STATE_COLOR: Record<MissionState, string> = {
  idle: 'default',
  running: 'processing',
  paused: 'warning',
  cancel: 'error',
}

function missionState(w: MissionWriteStatus['write']): MissionState {
  if (w.cancel_mission) return 'cancel'
  if (w.pause) return 'paused'
  if (w.start_mission) return 'running'
  return 'idle'
}

export default function MissionInfoPage() {
  const { t, i18n } = useTranslation()
  const { connected } = useRos()
  const write = useMissionWriteStatus()
  const feedback = useFeedbackFromAction()?.feedback ?? null

  const ms = write?.action?.mission_status
  const state = write?.write ? missionState(write.write) : null
  const hasMission = useHasMission()
  // 後端任務結束後不會清空 action_process，沒任務時不顯示殘留的動作
  const currentAction = hasMission ? feedback?.action_process?.trim() : undefined

  return (
    <div className="mi-page">
      <header className="mi-header">
        <Typography.Title level={4} className="mi-title">
          {t('mission.title')}
        </Typography.Title>
      </header>

      {/* /mission_control/write/status + action feedback */}
      <Card
        size="small"
        title={t('mission.status.title')}
        className="mi-card"
        extra={
          state && (
            <span className="mi-tags">
              {write?.write.charge_mission && <Tag color="green">{t('mission.status.charge')}</Tag>}
              <Tag color={MISSION_STATE_COLOR[state]}>{t(`mission.status.state.${state}`)}</Tag>
            </span>
          )
        }
      >
        <div className="mi-action">
          <span className="mi-action-label">{t('mission.status.currentAction')}</span>
          {currentAction ? (
            <span className="mi-action-value">
              {/* 代碼對照見 types.ts MissionFeedback 上方註解；沒翻譯的代碼直接顯示原文 */}
              {t(`mission.actions.${currentAction}`, { defaultValue: currentAction })}
              {i18n.exists(`mission.actions.${currentAction}`) && <span className="mi-action-code">{currentAction}</span>}
            </span>
          ) : (
            <span className="mi-action-value is-empty">{feedback ? t('mission.status.noAction') : '—'}</span>
          )}
        </div>

        {feedback?.warning_msg && <Alert type="warning" showIcon className="mi-alert" title={feedback.warning_msg} />}

        {write ? (
          <Descriptions
            size="small"
            column={{ xs: 1, md: 2 }}
            className="mi-desc"
            items={[
              { key: 'name', label: t('mission.status.name'), children: ms?.name?.length ? ms.name.join('、') : '—' },
              { key: 'operation', label: t('mission.status.operation'), children: write.action?.operation?.type || '—' },
              { key: 'start', label: t('mission.status.start'), children: ms?.start || '—' },
              { key: 'end', label: t('mission.status.end'), children: ms?.end || '—' },
            ]}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              connected ? t('mission.waitingData', { topic: TOPICS.missionWriteStatus.name }) : t('mission.rosNotConnected')
            }
          />
        )}
      </Card>
    </div>
  )
}
