import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, InputNumber, Popconfirm, Spin, Switch, Tag, Tooltip, Typography, message as antdMessage } from 'antd'
import {
  AimOutlined,
  CompressOutlined,
  EnvironmentOutlined,
  MinusOutlined,
  PlusOutlined,
  SendOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  useHasMission,
  useLocalizationCheck,
  useNdtScore,
  useRobotPose,
  useRos,
  useRosPublisher,
  useWebScan2d,
} from '../../hooks/useRos'
import { useThemeMode } from '../../hooks/useThemeMode'
import { NDT_STABLE_SCORE, PUB_TOPICS, TOPICS } from '../../ros/topics'
import type { PoseWithCovarianceStamped } from '../../ros/types'
import { MapCanvas, type MapCanvasHandle } from './MapCanvas'
import { loadMap, MAP_BASE_URL, normalizeAngle, yawToQuaternion, type LoadedMap, type Pose2D } from './mapData'
import './RvizPage.css'

const RAD2DEG = 180 / Math.PI

/** 與 RViz「2D Pose Estimate」相同的 covariance：x、y 各 0.25，yaw 約 (15°)² */
const INITIAL_POSE_COVARIANCE = (() => {
  const c = new Array<number>(36).fill(0)
  c[0] = 0.25
  c[7] = 0.25
  c[35] = 0.06853891945200942
  return c
})()

function buildInitialPose({ x, y, yaw }: Pose2D): PoseWithCovarianceStamped {
  return {
    header: { frame_id: 'map', stamp: { secs: 0, nsecs: 0 } },
    pose: { pose: { position: { x, y, z: 0 }, orientation: yawToQuaternion(yaw) }, covariance: INITIAL_POSE_COVARIANCE },
  }
}

const fmt = (v: number, digits = 2) => v.toFixed(digits)

/**
 * 定位校正：存「相對車子目前位置」的位移 / 旋轉，而不是絕對座標，
 * 所以校正途中車子位置更新時，幽靈車身會跟著車一起動（同 Traffic Dashboard 的 mi 系列定位校正）。
 */
interface Correction {
  dx: number
  dy: number
  /** 弧度 */
  dYaw: number
}
const ZERO_CORRECTION: Correction = { dx: 0, dy: 0, dYaw: 0 }

/** 超過這個時間沒收到點雲就不畫，避免舊點雲誤導對位 */
const SCAN_STALE_MS = 3000
const SHOW_SCAN_KEY = 'agvui.rviz.showScan'

function readShowScan() {
  try {
    return localStorage.getItem(SHOW_SCAN_KEY) !== '0'
  } catch {
    return true
  }
}

/** 每秒更新一次的「現在時間」，用來判斷資料是否過期（render 中不直接呼叫 Date.now()） */
function useNow(enabled: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return undefined
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, intervalMs])
  return now
}

export default function RvizPage() {
  const { t } = useTranslation()
  const [message, messageHolder] = antdMessage.useMessage()
  const { isDark } = useThemeMode()
  const { connected } = useRos()

  const odom = useRobotPose()
  const ndtScore = useNdtScore()
  const locError = useLocalizationCheck()
  const hasMission = useHasMission()
  const publishInitialPose = useRosPublisher<PoseWithCovarianceStamped>(PUB_TOPICS.initialPose)

  // 點雲：關閉時取消訂閱，車端 web_scan_2d 沒有訂閱者就會停止處理
  const [showScan, setShowScan] = useState(readShowScan)
  const scanMsg = useWebScan2d({ enabled: showScan })
  const now = useNow(showScan)
  const scanFresh = showScan && scanMsg != null && now - scanMsg.receivedAt < SCAN_STALE_MS
  const scan = scanFresh ? scanMsg : null
  const toggleScan = (on: boolean) => {
    setShowScan(on)
    try {
      localStorage.setItem(SHOW_SCAN_KEY, on ? '1' : '0')
    } catch {
      /* 無痕模式等情況存不了，不影響功能 */
    }
  }

  const [map, setMap] = useState<LoadedMap | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [follow, setFollow] = useState(false)
  const [correction, setCorrection] = useState<Correction | null>(null)
  const canvasRef = useRef<MapCanvasHandle>(null)
  const centeredOnceRef = useRef(false)

  const robot = useMemo<Pose2D | null>(() => (odom ? { x: odom.x, y: odom.y, yaw: odom.yaw } : null), [odom])
  const ghost = useMemo<Pose2D | null>(
    () =>
      robot && correction
        ? { x: robot.x + correction.dx, y: robot.y + correction.dy, yaw: normalizeAngle(robot.yaw + correction.dYaw) }
        : null,
    [robot, correction],
  )

  /* ---------- 地圖載入 ---------- */
  useEffect(() => {
    const ac = new AbortController()
    loadMap(MAP_BASE_URL, ac.signal)
      .then((m) => {
        setMap(m)
        setMapError(null)
      })
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setMapError(err instanceof Error ? err.message : String(err))
      })
    return () => ac.abort()
  }, [])

  /* ---------- 第一次收到位置時置中；開啟跟隨時持續置中 ---------- */
  useEffect(() => {
    if (!map || !robot) return
    if (!centeredOnceRef.current) {
      // 第一次：放大到 1 px = 1 地圖格（0.05 m），看得清楚周圍
      centeredOnceRef.current = true
      canvasRef.current?.centerOn(robot.x, robot.y, 1)
    } else if (follow) {
      canvasRef.current?.centerOn(robot.x, robot.y)
    }
  }, [map, robot, follow])

  /* ---------- 定位校正 ---------- */
  const blockReason = !connected
    ? t('rviz.block.disconnected')
    : hasMission
      ? t('rviz.block.hasMission')
      : !robot
        ? t('rviz.block.noPose')
        : null

  // 校正途中狀態改變（斷線、接到任務）就取消，避免送出過期的位置
  const [prevBlockReason, setPrevBlockReason] = useState(blockReason)
  if (blockReason !== prevBlockReason) {
    setPrevBlockReason(blockReason)
    if (blockReason) setCorrection(null)
  }

  const startCorrection = () => {
    if (!robot) return
    setFollow(false)
    setCorrection(ZERO_CORRECTION)
    canvasRef.current?.centerOn(robot.x, robot.y)
  }
  const cancelCorrection = () => setCorrection(null)
  const resetCorrection = () => setCorrection(ZERO_CORRECTION)

  /** 幽靈改到某個絕對位姿 → 換算成相對目前車子位置的校正量 */
  const setGhost = (next: Pose2D) => {
    if (!robot) return
    setCorrection({ dx: next.x - robot.x, dy: next.y - robot.y, dYaw: normalizeAngle(next.yaw - robot.yaw) })
  }
  const editGhost = (patch: Partial<Pose2D>) => ghost && setGhost({ ...ghost, ...patch })

  const sendPose = () => {
    if (!ghost || blockReason) return
    if (publishInitialPose(buildInitialPose(ghost))) {
      message.success(t('rviz.sent', { x: fmt(ghost.x, 3), y: fmt(ghost.y, 3), yaw: fmt(ghost.yaw * RAD2DEG, 1) }))
      setCorrection(null)
    } else {
      message.error(t('rviz.block.disconnected'))
    }
  }

  /* ---------- 定位狀態 ---------- */
  const scoreOk = ndtScore == null ? null : ndtScore >= NDT_STABLE_SCORE
  const locOk = locError == null ? null : !locError

  return (
    <div className="rv-page">
      {messageHolder}
      <section className="rv-map">
        {map ? (
          <MapCanvas
            ref={canvasRef}
            map={map}
            isDark={isDark}
            robot={robot}
            scan={scan}
            ghost={ghost}
            onGhostChange={setGhost}
            onUserMove={() => setFollow(false)}
          />
        ) : (
          <div className="rv-map-placeholder">
            {mapError ? (
              <Alert type="error" showIcon title={t('rviz.mapLoadFailed', { url: MAP_BASE_URL })} description={mapError} />
            ) : (
              <Spin />
            )}
          </div>
        )}

        {map && (
          <div className="rv-toolbar">
            <Tooltip title={t('rviz.zoomIn')} placement="left">
              <Button icon={<PlusOutlined />} onClick={() => canvasRef.current?.zoomBy(1.4)} />
            </Tooltip>
            <Tooltip title={t('rviz.zoomOut')} placement="left">
              <Button icon={<MinusOutlined />} onClick={() => canvasRef.current?.zoomBy(1 / 1.4)} />
            </Tooltip>
            <Tooltip title={t('rviz.fitMap')} placement="left">
              <Button icon={<CompressOutlined />} onClick={() => { setFollow(false); canvasRef.current?.fitMap() }} />
            </Tooltip>
            <Tooltip title={t(follow ? 'rviz.followOff' : 'rviz.followOn')} placement="left">
              <Button
                type={follow ? 'primary' : 'default'}
                icon={<AimOutlined />}
                disabled={!robot}
                onClick={() => setFollow((f) => !f)}
              />
            </Tooltip>
          </div>
        )}

        {ghost && <div className="rv-hint">{t('rviz.hint')}</div>}
      </section>

      <aside className="rv-panel">
        <Card size="small" title={t('rviz.status')}>
          <dl className="rv-rows">
            <div className="rv-row">
              <dt>{t('rviz.ndtScore')}</dt>
              <dd>
                {ndtScore == null ? (
                  '—'
                ) : (
                  <Tag color={scoreOk ? 'success' : 'error'}>
                    {fmt(ndtScore)} {scoreOk ? t('rviz.ok') : t('rviz.abnormal')}
                  </Tag>
                )}
              </dd>
            </div>
            <div className="rv-row">
              <dt>{t('rviz.locCheck')}</dt>
              <dd>
                {locOk == null ? '—' : <Tag color={locOk ? 'success' : 'error'}>{locOk ? t('rviz.ok') : t('rviz.abnormal')}</Tag>}
              </dd>
            </div>
            <div className="rv-row">
              <dt>{t('rviz.hasMission')}</dt>
              <dd>{hasMission == null ? '—' : <Tag color={hasMission ? 'processing' : 'default'}>{t(hasMission ? 'rviz.yes' : 'rviz.no')}</Tag>}</dd>
            </div>
            <div className="rv-row">
              <dt>{t('rviz.scan')}</dt>
              <dd className="rv-scan">
                {showScan && (
                  <Tooltip title={scan ? undefined : t('rviz.scanWaiting', { topic: TOPICS.webScan2d.name })}>
                    <Typography.Text type="secondary" className="rv-mono">
                      {scan ? t('rviz.scanPoints', { count: scan.points.length / 2 }) : t('rviz.scanNone')}
                    </Typography.Text>
                  </Tooltip>
                )}
                <Switch size="small" checked={showScan} onChange={toggleScan} />
              </dd>
            </div>
            <div className="rv-row">
              <dt>{t('rviz.position')}</dt>
              <dd className="rv-mono">{robot ? `${fmt(robot.x)}, ${fmt(robot.y)}` : '—'}</dd>
            </div>
            <div className="rv-row">
              <dt>{t('rviz.heading')}</dt>
              <dd className="rv-mono">{robot ? `${fmt(robot.yaw * RAD2DEG, 1)}°` : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card size="small" title={t('rviz.setPose')}>
          {!ghost ? (
            <>
              <Tooltip title={blockReason}>
                <Button type="primary" block icon={<EnvironmentOutlined />} disabled={!!blockReason || !map} onClick={startCorrection}>
                  {t('rviz.setPoseStart')}
                </Button>
              </Tooltip>
              <Typography.Paragraph type="secondary" className="rv-note">
                {t('rviz.setPoseNote', { score: NDT_STABLE_SCORE })}
              </Typography.Paragraph>
            </>
          ) : (
            <div className="rv-pose-form">
              <Typography.Text type="secondary">{t('rviz.hint')}</Typography.Text>
              {scan && (
                <Typography.Text type="secondary" className="rv-delta">
                  {t('rviz.setPoseScanNote')}
                </Typography.Text>
              )}
              <label>
                <span>X (m)</span>
                <InputNumber size="small" step={0.05} precision={3} value={ghost.x} onChange={(v) => v != null && editGhost({ x: v })} />
              </label>
              <label>
                <span>Y (m)</span>
                <InputNumber size="small" step={0.05} precision={3} value={ghost.y} onChange={(v) => v != null && editGhost({ y: v })} />
              </label>
              <label>
                <span>{t('rviz.heading')} (°)</span>
                <InputNumber
                  size="small"
                  step={1}
                  precision={1}
                  value={Number((ghost.yaw * RAD2DEG).toFixed(1))}
                  onChange={(v) => v != null && editGhost({ yaw: v / RAD2DEG })}
                />
              </label>
              {correction && (
                <Typography.Text type="secondary" className="rv-mono rv-delta">
                  {t('rviz.delta', {
                    d: fmt(Math.hypot(correction.dx, correction.dy)),
                    yaw: fmt(correction.dYaw * RAD2DEG, 1),
                  })}
                </Typography.Text>
              )}
              <div className="rv-pose-actions">
                <Button icon={<UndoOutlined />} onClick={resetCorrection}>
                  {t('rviz.reset')}
                </Button>
                <Button onClick={cancelCorrection}>{t('rviz.cancel')}</Button>
                <Popconfirm
                  title={t('rviz.confirmTitle')}
                  description={t('rviz.confirmDesc', { x: fmt(ghost.x, 3), y: fmt(ghost.y, 3), yaw: fmt(ghost.yaw * RAD2DEG, 1) })}
                  onConfirm={sendPose}
                >
                  <Button type="primary" icon={<SendOutlined />}>
                    {t('rviz.send')}
                  </Button>
                </Popconfirm>
              </div>
            </div>
          )}
        </Card>
      </aside>
    </div>
  )
}
