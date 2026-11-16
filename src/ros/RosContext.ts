import { createContext } from 'react'
import type { Ros } from 'roslib'

export interface RosContextValue {
  ros: Ros | null
  connected: boolean
  url: string
  error: unknown
}

export const RosContext = createContext<RosContextValue | null>(null)
