import type { ReactNode } from 'react'
import { Alert, Card, Masonry, Progress, Typography } from 'antd'
import {
  ApiOutlined,
  AimOutlined,
  ColumnHeightOutlined,
  DashboardOutlined,
  RadarChartOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useIoInfo, useMissionReadStatus, useRos } from '../../hooks/useRos'
import { TOPICS } from '../../ros/topics'
import { SECTIONS, activeAlarms, type RowDef, type SectionDef, type SectionKey } from './sections'
import { StatusValue } from './StatusValue'
import './DetailInfoPage.css'

const SECTION_ICONS: Record<SectionKey, ReactNode> = {
  firmware: <ApiOutlined />,
  sensor: <AimOutlined />,
  battery: <ThunderboltOutlined />,
  lidar: <RadarChartOutlined />,
  speed: <DashboardOutlined />,
  fork: <ColumnHeightOutlined />,
}

function batteryColor(pct: number) {
  if (pct < 20) return '#ff4d4f'
  if (pct < 40) return '#faad14'
  return '#52c41a'
}

export default function DetailInfoPage() {
  const { t } = useTranslation()
  const { connected } = useRos()
  const io = useIoInfo()
  const readStatus = useMissionReadStatus()
  const amrId = readStatus?.info.amr_id ?? null
  const battery = io?.battery_info?.battery ?? null
  const isAuto = io ? Number(io.manual_mode) !== 0 : null
  const alarms = io ? activeAlarms(io) : []
  const firmwareOk = io ? Number(io.heartBeatSignal) === 0 : null

  const renderRows = (rows: RowDef[]) => (
    <dl className="di-rows">
      {rows.map((row) => (
        <div className="di-row" key={row.key}>
          <dt>{t(row.labelKey)}</dt>
          <dd>
            <StatusValue value={io ? row.value(io) : null} />
          </dd>
        </div>
      ))}
    </dl>
  )

  const renderSection = (section: SectionDef) => (
    <Card
      size="small"
      className="di-card"
      title={
        <span className="di-card-title">
          <span className="di-card-icon">{SECTION_ICONS[section.key]}</span>
          {t(section.titleKey)}
        </span>
      }
    >
      {section.key === 'battery' && battery != null && (
        <Progress
          percent={Number(battery.toFixed(1))}
          strokeColor={batteryColor(battery)}
          size="small"
          className="di-battery-bar"
        />
      )}
      {section.rows && renderRows(section.rows)}
      {section.groups?.map((group) => (
        <div className="di-group" key={group.key}>
          <div className="di-group-title">{t(group.titleKey)}</div>
          {renderRows(group.rows)}
        </div>
      ))}
    </Card>
  )

  return (
    <div className="di-page">
      {/* ROS 連線狀態已移到全站 header */}
      <header className="di-header">
        <Typography.Title level={4} className="di-title">
          {t('detail.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('detail.amr', { id: amrId ?? '—' })}</Typography.Text>
      </header>

      {/* 一眼看重點：小螢幕 2×2，寬螢幕 1×4 */}
      <section className="di-summary">
        <div className="di-tile">
          <span className="di-tile-label">{t('detail.summary.firmware')}</span>
          <span className={`di-tile-value ${firmwareOk === false ? 'di-error' : ''}`}>
            {firmwareOk == null ? '—' : t(firmwareOk ? 'status.connected' : 'status.disconnected')}
          </span>
        </div>
        <div className="di-tile">
          <span className="di-tile-label">{t('detail.summary.mode')}</span>
          <span className={`di-tile-value ${isAuto === false ? 'di-warning' : ''}`}>
            {isAuto == null ? '—' : t(isAuto ? 'status.auto' : 'status.maintenance')}
          </span>
        </div>
        <div className="di-tile">
          <span className="di-tile-label">{t('detail.summary.battery')}</span>
          <span className="di-tile-value" style={battery != null ? { color: batteryColor(battery) } : undefined}>
            {battery == null ? '—' : `${battery.toFixed(0)}%`}
          </span>
        </div>
        <div className="di-tile">
          <span className="di-tile-label">{t('detail.summary.alarms')}</span>
          <span className={`di-tile-value ${alarms.length ? 'di-error' : ''}`}>{io ? alarms.length : '—'}</span>
        </div>
      </section>

      {!io && (
        <Alert
          type="info"
          showIcon
          title={connected ? t('detail.waitingData', { topic: TOPICS.ioInfo.name }) : t('detail.rosNotConnected')}
        />
      )}
      {alarms.length > 0 && (
        <Alert type="error" showIcon icon={<WarningOutlined />} title={t('detail.alarmsActive', { list: alarms.map((k) => t(k)).join(t('detail.listSeparator')) })} />
      )}

      <Masonry
        columns={{ xs: 1, md: 2, xl: 3 }}
        gutter={12}
        items={SECTIONS.map((s) => ({ key: s.key, data: s }))}
        itemRender={({ data }) => renderSection(data)}
      />
    </div>
  )
}
