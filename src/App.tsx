import { useEffect, useMemo } from 'react'
import { ConfigProvider, theme as antdTheme, type ThemeConfig } from 'antd'
import enUS from 'antd/locale/en_US'
import zhTW from 'antd/locale/zh_TW'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { useThemeMode } from './hooks/useThemeMode'
import AppLayout from './layout/AppLayout'
import { APP_ROUTES } from './routes'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      ...APP_ROUTES.map(({ path, element }) => ({ path, element })),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

function buildTheme(isDark: boolean): ThemeConfig {
  // 與 index.css 的 --app-bg 保持一致
  const bg = isDark ? '#0f141b' : '#f5f7fa'
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#2f6fed',
      borderRadius: 10,
      fontSize: 14,
      colorBgLayout: bg,
      ...(isDark && { colorBgContainer: '#171d26', colorBgElevated: '#1d2430' }),
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', Roboto, sans-serif",
    },
    components: {
      // header 與內容同底色
      Layout: { headerBg: bg, headerHeight: 72, headerPadding: '0 16px' },
      Menu: { horizontalLineHeight: '62px' },
    },
  }
}

function App() {
  const { t, i18n } = useTranslation()
  const { isDark } = useThemeMode()
  const theme = useMemo(() => buildTheme(isDark), [isDark])

  useEffect(() => {
    document.title = t('app.title')
  }, [t, i18n.resolvedLanguage])

  return (
    <ConfigProvider theme={theme} locale={i18n.resolvedLanguage === 'en' ? enUS : zhTW}>
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}

export default App
