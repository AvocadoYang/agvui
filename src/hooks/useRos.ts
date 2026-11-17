import { useContext, useEffect, useRef, useState } from 'react'
import { Topic } from 'roslib'
import { RosContext, type RosContextValue } from '../ros/RosContext'
import { TOPICS, type TopicDef } from '../ros/topics'

/** 取得共用的 ROS 連線（必須包在 <RosProvider> 底下） */
export function useRos(): RosContextValue {
  const ctx = useContext(RosContext)
  if (!ctx) throw new Error('useRos must be used inside <RosProvider>')
  return ctx
}

interface UseRosTopicOptions {
  /** false 時暫停訂閱 */
  enabled?: boolean
}

/**
 * 通用訂閱 hook。parse 回傳 undefined 的訊息會被略過（保留上一筆）。
 * 回傳 null 代表尚未收到任何訊息。
 */
export function useRosTopic<Raw, T>(
  def: TopicDef<Raw, T | undefined>,
  { enabled = true }: UseRosTopicOptions = {},
): T | null {
  const { ros } = useRos()
  const [value, setValue] = useState<T | null>(null)

  // parse 放 ref，避免呼叫端傳 inline function 時一直重新訂閱
  const parseRef = useRef(def.parse)
  useEffect(() => {
    parseRef.current = def.parse
  }, [def.parse])

  const { name, messageType, throttleRate = 0 } = def

  useEffect(() => {
    if (!ros || !enabled) return undefined

    const topic = new Topic<Raw>({ ros, name, messageType, throttle_rate: throttleRate })
    const handler = (raw: Raw) => {
        const parsed = parseRef.current(raw)
      if (parsed !== undefined) setValue(parsed)
    }
    topic.subscribe(handler)

    return () => {
      topic.unsubscribe(handler)
    }
  }, [ros, enabled, name, messageType, throttleRate])

  return value
}

/* ---------- 各 topic 專用 hook ---------- */

/** /mission_control/read/status：任務狀態、AMR ID、警告 */
export const useMissionReadStatus = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.missionReadStatus, opts)

/** /mission_control/write/status：下發的任務狀態 */
export const useMissionWriteStatus = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.missionWriteStatus, opts)

/** /kenmec_fork/io_info：IO、電量、手自動模式 */
export const useIoInfo = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.ioInfo, opts)

/** /kenmec_fork/vehicle_status：車輛、充電站、韌體連線與各安全裝置狀態 */
export const useVehicleStatus = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.vehicleStatus, opts)

/** /kenmec_fork/fleet_manager/mission/feedback：任務 action 的 feedback（目前狀態、動作進度、導航狀態等） */
export const useFeedbackFromAction = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.missionFeedback, opts)

/** /kenmec_fork/has_mission：目前是否有任務（null = 尚未收到） */
export const useHasMission = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.hasMission, opts)

/** /kenmec_fork/error_info：錯誤碼與訊息 */
export const useErrorInfo = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.errorInfo, opts)

/** /hdl_odom：位置 x、y 與 yaw（預設 rosbridge 節流 100ms） */
export const useRobotPose = (opts?: UseRosTopicOptions) => useRosTopic(TOPICS.odom, opts)

/** 一次拿齊常用狀態（整理自舊版 RobotState 元件） */
export function useAgvStatus() {
  const { connected } = useRos()
  const readStatus = useMissionReadStatus()
  const writeStatus = useMissionWriteStatus()
  const io = useIoInfo()
  const errorInfo = useErrorInfo()
  const pose = useRobotPose()

  return {
    connected,
    readStatus,
    writeStatus,
    io,
    errorInfo,
    pose,
    // 衍生欄位
    amrId: readStatus?.info.amr_id ?? null,
    warningMsg: readStatus?.info.warning_msg ?? '',
    debugMsg: readStatus?.info.debug ?? '',
    battery: io?.battery_info.battery ?? null,
    isAuto: io ? io.manual_mode !== 0 : null,
  }
}
