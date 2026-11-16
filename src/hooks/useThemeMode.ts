import { useContext } from 'react'
import { ThemeContext, type ThemeContextValue } from '../theme/ThemeContext'

/** 取得目前的淺色/深色模式（必須包在 <ThemeProvider> 底下） */
export function useThemeMode(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeMode must be used inside <ThemeProvider>')
  return ctx
}
