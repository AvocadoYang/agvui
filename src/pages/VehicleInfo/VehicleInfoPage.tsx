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
import './VehicleInfoPage.css'

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

export default function VehicleInfoPage() {
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
    <dl className="vi-rows">
      {rows.map((row) => (
        <div className="vi-row" key={row.key}>
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
      className="vi-card"
      title={
        <span className="vi-card-title">
          <span className="vi-card-icon">{SECTION_ICONS[section.key]}</span>
          {t(section.titleKey)}
        </span>
      }
    >
      {section.key === 'battery' && battery != null && (
        <Progress
          percent={Number(battery.toFixed(1))}
          strokeColor={batteryColor(battery)}
          size="small"
          className="vi-battery-bar"
        />
      )}
      {section.rows && renderRows(section.rows)}
      {section.groups?.map((group) => (
        <div className="vi-group" key={group.key}>
          <div className="vi-group-title">{t(group.titleKey)}</div>
          {renderRows(group.rows)}
        </div>
      ))}
    </Card>
  )

  return (
    <div className="vi-page">
      {/* ROS 連線狀態已移到全站 header */}
      <header className="vi-header">
        <Typography.Title level={4} className="vi-title">
          {t('vehicle.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('vehicle.amr', { id: amrId ?? '—' })}</Typography.Text>
      </header>

      {/* 一眼看重點：小螢幕 2×2，寬螢幕 1×4 */}
      <section className="vi-summary">
        <div className="vi-tile">
          <span className="vi-tile-label">{t('vehicle.summary.firmware')}</span>
          <span className={`vi-tile-value ${firmwareOk === false ? 'vi-error' : ''}`}>
            {firmwareOk == null ? '—' : t(firmwareOk ? 'status.connected' : 'status.disconnected')}
          </span>
        </div>
        <div className="vi-tile">
          <span className="vi-tile-label">{t('vehicle.summary.mode')}</span>
          <span className={`vi-tile-value ${isAuto === false ? 'vi-warning' : ''}`}>
            {isAuto == null ? '—' : t(isAuto ? 'status.auto' : 'status.maintenance')}
          </span>
        </div>
        <div className="vi-tile">
          <span className="vi-tile-label">{t('vehicle.summary.battery')}</span>
          <span className="vi-tile-value" style={battery != null ? { color: batteryColor(battery) } : undefined}>
            {battery == null ? '—' : `${battery.toFixed(0)}%`}
          </span>
        </div>
        <div className="vi-tile">
          <span className="vi-tile-label">{t('vehicle.summary.alarms')}</span>
          <span className={`vi-tile-value ${alarms.length ? 'vi-error' : ''}`}>{io ? alarms.length : '—'}</span>
        </div>
      </section>

      {!io && (
        <Alert
          type="info"
          showIcon
          title={connected ? t('vehicle.waitingData', { topic: TOPICS.ioInfo.name }) : t('vehicle.rosNotConnected')}
        />
      )}
      {alarms.length > 0 && (
        <Alert type="error" showIcon icon={<WarningOutlined />} title={t('vehicle.alarmsActive', { list: alarms.map((k) => t(k)).join(t('vehicle.listSeparator')) })} />
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
