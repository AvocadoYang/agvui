import { useEffect, useState } from 'react'
import { CameraFilled } from '@ant-design/icons'
import { useThemeMode } from '../../hooks/useThemeMode'

/**
 * 車輛卡片上的叉車圖示，依 action_process 換圖 / 播動畫。
 *
 *   F / FH          前進：往車頭方向（左）晃 + 地面虛線往後流
 *   B / BH          後退：往枒杈方向（右），方向相反
 *   S / SH          旋轉：assets/spin 8 個角度輪播
 *   H / tilt / fork_height   枒杈升降：assets/forkAction 4 張來回播
 *   clamp           夾具升降：assets/clamp 6 張來回播
 *   verity_cargo / cargo_limit   影像辨識：靜態叉車 + 右上角相機
 *   其他 / 無任務    靜態圖（沒任務時微跳動）
 *   ROS / 資料沒進來 整個反灰
 *
 * 每組圖都有 light / dark 兩版，跟著主題切換。
 */

type Theme = 'light' | 'dark'

const glob = {
  spin: import.meta.glob<string>('../../assets/spin/*.png', { eager: true, import: 'default' }),
  fork: import.meta.glob<string>('../../assets/forkAction/*.png', { eager: true, import: 'default' }),
  clamp: import.meta.glob<string>('../../assets/clamp/*.png', { eager: true, import: 'default' }),
}

/** 依檔名排序（檔名已含 000~315、frame1~frameN），並只取該主題的圖 */
function frames(files: Record<string, string>, theme: Theme) {
  return Object.keys(files)
    .filter((path) => path.includes(`_${theme}_`))
    .sort()
    .map((path) => files[path])
}

const FRAMES = {
  light: { spin: frames(glob.spin, 'light'), fork: frames(glob.fork, 'light'), clamp: frames(glob.clamp, 'light') },
  dark: { spin: frames(glob.spin, 'dark'), fork: frames(glob.fork, 'dark'), clamp: frames(glob.clamp, 'dark') },
}

/** 靜止時用 45° 斜角的那張；前進 / 後退 / 影像辨識用側面 frame2 */
const pick = (list: string[], name: string) => list.find((src) => src.includes(name)) ?? list[0]
const still = (theme: Theme) => pick(FRAMES[theme].spin, '_045')
const side = (theme: Theme) => pick(FRAMES[theme].fork, 'nocargo_frame2')

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

type Anim =
  | { kind: 'still'; src: string }
  | { kind: 'move'; src: string; dir: 'forward' | 'backward' }
  | { kind: 'frames'; frames: string[]; interval: number; pingpong: boolean }
  | { kind: 'camera'; src: string }

function animFor(action: string | null | undefined, theme: Theme): Anim {
  const f = FRAMES[theme]
  switch (action) {
    case 'F':
    case 'FH':
      return { kind: 'move', src: side(theme), dir: 'forward' }
    case 'B':
    case 'BH':
      return { kind: 'move', src: side(theme), dir: 'backward' }
    case 'S':
    case 'SH':
      return { kind: 'frames', frames: f.spin, interval: 150, pingpong: false }
    case 'H':
    case 'tilt':
    case 'fork_height':
      return { kind: 'frames', frames: f.fork, interval: 250, pingpong: true }
    case 'clamp':
      return { kind: 'frames', frames: f.clamp, interval: 180, pingpong: true }
    case 'verity_cargo':
    case 'cargo_limit':
      return { kind: 'camera', src: side(theme) }
    default:
      return { kind: 'still', src: still(theme) }
  }
}

/** 逐格輪播；所有圖都先疊好只切換顯示，換格時不會閃 */
function FrameLoop({ frames, interval, pingpong }: { frames: string[]; interval: number; pingpong: boolean }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (reducedMotion || frames.length < 2) return
    const id = setInterval(() => setTick((n) => n + 1), interval)
    return () => clearInterval(id)
  }, [frames.length, interval])

  const n = frames.length
  const period = pingpong ? Math.max(1, 2 * n - 2) : n
  const i = tick % period
  const index = i < n ? i : period - i

  return (
    <span className="vc-frames">
      {frames.map((src, k) => (
        <img key={src} src={src} alt="" className={k === index ? 'is-active' : undefined} />
      ))}
    </span>
  )
}

interface Props {
  action: string | null | undefined
  label?: string
  /** ROS 或資料沒進來：整個反灰、不播動畫 */
  offline?: boolean
  /** 已連線且沒有任務：靜態圖微跳動 */
  idle?: boolean
}

export function ForkliftAnimation({ action, label, offline = false, idle = false }: Props) {
  const { isDark } = useThemeMode()
  const theme: Theme = isDark ? 'dark' : 'light'
  const anim = animFor(offline ? null : action, theme)

  let content
  switch (anim.kind) {
    case 'move':
      content = (
        <span className={`vc-move is-${anim.dir}`}>
          <img src={anim.src} alt="" />
        </span>
      )
      break
    case 'frames':
      // key：換動作或主題時從第一格重新播
      content = <FrameLoop key={`${action}-${theme}`} {...anim} />
      break
    case 'camera':
      content = (
        <span className="vc-camera">
          <img src={anim.src} alt="" />
          <span className="vc-camera-badge">
            <CameraFilled />
          </span>
        </span>
      )
      break
    default:
      content = <img src={anim.src} alt="" />
  }

  return (
    <div
      className={`vc-avatar ${offline ? 'is-offline' : idle && anim.kind === 'still' ? 'is-idle' : ''}`}
      role="img"
      aria-label={label}
    >
      {content}
    </div>
  )
}
