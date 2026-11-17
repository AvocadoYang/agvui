import { Badge, Button, Dropdown, Grid, Layout, Menu, Tooltip } from 'antd'
import { GlobalOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation } from 'react-router'
import logoDark from '../assets/kenmec-logo-dark.png'
import logoLight from '../assets/kenmec-logo.png'
import { useRos } from '../hooks/useRos'
import { useThemeMode } from '../hooks/useThemeMode'
import { LANGUAGES } from '../i18n'
import { APP_ROUTES } from '../routes'
import './AppLayout.css'

export default function AppLayout() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const { connected } = useRos()
  const screens = Grid.useBreakpoint()
  const { isDark, toggle } = useThemeMode()
  const themeLabel = t(isDark ? 'app.lightMode' : 'app.darkMode')

  const currentLang = i18n.resolvedLanguage ?? i18n.language
  const rosText = t(connected ? 'app.rosConnected' : 'app.rosDisconnected')

  return (
    <Layout className="app-layout">
      <Layout.Header className="app-header">
        <Link to="/" className="app-logo" aria-label="KENMEC">
          <img src={isDark ? logoDark : logoLight} alt="KENMEC" />
        </Link>

        {/* 頁面多到放不下時，antd 會自動收進「⋯」 */}
        <Menu
          mode="horizontal"
          className="app-menu"
          selectedKeys={[pathname]}
          items={APP_ROUTES.map((r) => ({
            key: r.path,
            icon: r.icon,
            label: <Link to={r.path}>{t(r.labelKey)}</Link>,
          }))}
        />

        <div className="app-header-right">
          <Tooltip title={screens.sm ? undefined : rosText}>
            <Badge status={connected ? 'success' : 'error'} text={screens.sm ? rosText : undefined} />
          </Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{
              selectable: true,
              selectedKeys: [currentLang],
              items: LANGUAGES.map((l) => ({ key: l.code, label: l.label })),
              onClick: ({ key }) => void i18n.changeLanguage(key),
            }}
          >
            <Button type="text" icon={<GlobalOutlined />} aria-label={t('app.language')}>
              {screens.sm && LANGUAGES.find((l) => l.code === currentLang)?.label}
            </Button>
          </Dropdown>
          <Tooltip title={themeLabel}>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              aria-label={themeLabel}
              onClick={toggle}
            />
          </Tooltip>
        </div>
      </Layout.Header>

      <Layout.Content>
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
