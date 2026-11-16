import { Card, Empty, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import './MissionInfoPage.css'

export default function MissionInfoPage() {
  const { t } = useTranslation()

  return (
    <div className="mi-page">
      <header className="mi-header">
        <Typography.Title level={4} className="mi-title">
          {t('mission.title')}
        </Typography.Title>
      </header>

      <Card size="small">
        <Empty description={t('mission.empty')} />
      </Card>
    </div>
  )
}
