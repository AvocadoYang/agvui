import type { ReactNode } from 'react'
import { DashboardOutlined } from '@ant-design/icons'
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
]
