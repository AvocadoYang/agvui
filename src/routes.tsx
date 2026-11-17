import type { ReactNode } from 'react'
import { DashboardOutlined, EnvironmentOutlined, FileSearchOutlined, HistoryOutlined } from '@ant-design/icons'
import DetailInfoPage from './pages/DetailInfo/DetailInfoPage'
import EventLogPage from './pages/EventLog/EventLogPage'
import RvizPage from './pages/Rviz/RvizPage'
// import MissionInfoPage from './pages/MissionInfo/MissionInfoPage'
import VehicleInfoPage from './pages/VehicleInfo/VehicleInfoPage'

export interface AppRoute {
  path: string
  /** i18n key，顯示在 header 選單 */
  labelKey: string
  icon: ReactNode
  element: ReactNode
}

/** 新增頁面：在這裡加一筆，header 選單會自動出現 */
export const APP_ROUTES: AppRoute[] = [
  { path: '/', labelKey: 'nav.vehicleInfo', icon: <DashboardOutlined />, element: <VehicleInfoPage /> },
  { path: '/detail', labelKey: 'nav.detailInfo', icon: <FileSearchOutlined />, element: <DetailInfoPage /> },
  // { path: '/mission', labelKey: 'nav.missionInfo', icon: <ProfileOutlined />, element: <MissionInfoPage /> },
  { path: '/rviz', labelKey: 'nav.rviz', icon: <EnvironmentOutlined />, element: <RvizPage /> },
  { path: '/log', labelKey: 'nav.log', icon: <HistoryOutlined />, element: <EventLogPage /> },
]
