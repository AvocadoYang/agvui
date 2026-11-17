import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react'
import type { WebScan2D } from '../../ros/types'
import { normalizeAngle, worldToPixel, type LoadedMap, type Pose2D } from './mapData'

/** 畫面座標 = 地圖像素 × scale + (tx, ty)，單位都是 CSS px */
interface View {
  scale: number
  tx: number
  ty: number
}

export interface MapCanvasHandle {
  fitMap: () => void
  /** scale 不給就維持目前縮放 */
  centerOn: (x: number, y: number, scale?: number) => void
  zoomBy: (factor: number) => void
}

interface MapCanvasProps {
  ref?: Ref<MapCanvasHandle>
  map: LoadedMap
  isDark: boolean
  robot: Pose2D | null
  /** map frame 下的 2D 點雲；null = 不顯示 */
  scan: WebScan2D | null
  /** 定位校正的幽靈車身（絕對位姿）；null = 不在校正中 */
  ghost: Pose2D | null
  /** 拖曳車身（平移）或旋轉把手（旋轉）時回傳新的幽靈位姿 */
  onGhostChange: (pose: Pose2D) => void
  /** 使用者手動拖曳 / 縮放畫面時通知（用來關閉跟隨） */
  onUserMove?: () => void
}

const MIN_SCALE = 0.05
const MAX_SCALE = 12

/* 幽靈車身尺寸（畫面 px，不隨縮放改變，方便拖曳） */
const GHOST_LEN = 34
const GHOST_WID = 24
/** 旋轉把手到車身中心的距離 */
const HANDLE_DIST = 46
const HANDLE_R = 7
const GHOST_COLOR = '#fa8c16'
const HANDLE_COLOR = '#722ed1'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

/** 以 (cx, cy) 為中心畫箭頭；angle 為畫面座標角度（y 向下） */
function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, color: string, size = 18) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  ctx.beginPath()
  ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2)
  ctx.fillStyle = color + '33'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(size * 1.6, 0)
  ctx.lineTo(size * 0.2, -size * 0.7)
  ctx.lineTo(size * 0.55, 0)
  ctx.lineTo(size * 0.2, size * 0.7)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

/** 幽靈車身：半透明虛線車身 + 車頭三角 + 前方的旋轉把手 */
function drawGhost(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, active: 'body' | 'handle' | null) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  // 把手連線
  ctx.beginPath()
  ctx.moveTo(GHOST_LEN / 2, 0)
  ctx.lineTo(HANDLE_DIST - HANDLE_R, 0)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = HANDLE_COLOR
  ctx.stroke()

  // 車身
  ctx.beginPath()
  ctx.roundRect(-GHOST_LEN / 2, -GHOST_WID / 2, GHOST_LEN, GHOST_WID, 4)
  ctx.fillStyle = GHOST_COLOR
  ctx.globalAlpha = active === 'body' ? 0.75 : 0.5
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.setLineDash([4, 3])
  ctx.lineWidth = 2
  ctx.strokeStyle = '#d4380d'
  ctx.stroke()
  ctx.setLineDash([])

  // 車頭方向
  ctx.beginPath()
  ctx.moveTo(GHOST_LEN / 2 - 3, 0)
  ctx.lineTo(-2, -GHOST_WID / 2 + 5)
  ctx.lineTo(-2, GHOST_WID / 2 - 5)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.globalAlpha = 0.9
  ctx.fill()
  ctx.globalAlpha = 1

  // 旋轉把手
  ctx.beginPath()
  ctx.arc(HANDLE_DIST, 0, active === 'handle' ? HANDLE_R + 2 : HANDLE_R, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = HANDLE_COLOR
  ctx.stroke()

  ctx.restore()
}

/**
 * 一次 path 畫完所有點（每點一個小方塊），畫面外的點略過。
 * relocate 有值時，先把點雲從 from 位姿搬到 to 位姿（預覽校正後的對齊結果）。
 */
function drawScan(
  ctx: CanvasRenderingContext2D,
  map: LoadedMap,
  view: View,
  size: { w: number; h: number },
  points: Float32Array,
  color: string,
  alpha: number,
  relocate?: { from: Pose2D; to: Pose2D },
) {
  // world → screen 是線性的：sx = x·k + bx，sy = −y·k + by
  const k = view.scale / map.resolution
  const bx = view.tx - (map.origin[0] / map.resolution) * view.scale
  const by = view.ty + (map.height + map.origin[1] / map.resolution) * view.scale
  // 縮小時點變小，但至少 1.5 px 才看得到
  const d = clamp(k * 0.08, 1.5, 4)
  const half = d / 2

  let cos = 1
  let sin = 0
  if (relocate) {
    const dyaw = relocate.to.yaw - relocate.from.yaw
    cos = Math.cos(dyaw)
    sin = Math.sin(dyaw)
  }

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < points.length; i += 2) {
    let x = points[i]
    let y = points[i + 1]
    if (relocate) {
      const rx = x - relocate.from.x
      const ry = y - relocate.from.y
      x = relocate.to.x + rx * cos - ry * sin
      y = relocate.to.y + rx * sin + ry * cos
    }
    const sx = x * k + bx
    const sy = -y * k + by
    if (sx < -d || sy < -d || sx > size.w + d || sy > size.h + d) continue
    ctx.rect(sx - half, sy - half, d, d)
  }
  ctx.fill()
  ctx.restore()
}

type Drag =
  | { kind: 'pan' }
  | { kind: 'ghost-move'; startX: number; startY: number; base: Pose2D }
  | { kind: 'ghost-rotate'; base: Pose2D }

export function MapCanvas({ ref, map, isDark, robot, scan, ghost, onGhostChange, onUserMove }: MapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 })
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const rafRef = useRef(0)
  const initializedRef = useRef(false)
  /** 滑鼠目前懸停 / 正在拖曳的幽靈部位，用來加亮 */
  const activePartRef = useRef<'body' | 'handle' | null>(null)

  // 繪圖與事件 handler 讀最新的 props，不用每次 props 改變就重建
  const stateRef = useRef({ map, isDark, robot, scan, ghost })
  const callbacksRef = useRef({ onGhostChange, onUserMove })
  // 主題色在切換主題時讀一次，不在每幀呼叫 getComputedStyle
  const robotColorRef = useRef('#2f6fed')
  useLayoutEffect(() => {
    stateRef.current = { map, isDark, robot, scan, ghost }
    callbacksRef.current = { onGhostChange, onUserMove }
  })
  useLayoutEffect(() => {
    robotColorRef.current = cssVar('--app-primary', '#2f6fed')
  }, [isDark])

  /** world → 畫面座標 */
  const toScreen = useCallback((x: number, y: number) => {
    const { scale, tx, ty } = viewRef.current
    const { px, py } = worldToPixel(stateRef.current.map, x, y)
    return { sx: px * scale + tx, sy: py * scale + ty }
  }, [])

  /* ---------- 繪圖：只在需要時排一次 rAF ---------- */

  const draw = useCallback(() => {
    rafRef.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { w, h, dpr } = sizeRef.current
    const { scale, tx, ty } = viewRef.current
    const { map, isDark, robot, scan, ghost } = stateRef.current

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = isDark ? '#0b0f15' : '#dfe3ea'
    ctx.fillRect(0, 0, w, h)

    // 地圖層
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty)
    ctx.imageSmoothingEnabled = scale < 2
    ctx.drawImage(isDark ? map.dark : map.light, 0, 0)

    // 上層物件用畫面座標畫，大小不隨縮放改變
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // map frame 原點
    const o = toScreen(0, 0)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#ff4d4f'
    ctx.beginPath()
    ctx.moveTo(o.sx, o.sy)
    ctx.lineTo(o.sx + 24, o.sy)
    ctx.stroke()
    ctx.strokeStyle = '#52c41a'
    ctx.beginPath()
    ctx.moveTo(o.sx, o.sy)
    ctx.lineTo(o.sx, o.sy - 24)
    ctx.stroke()

    if (scan && scan.points.length) {
      // 校正中：原本的點雲淡化，另外畫出「車在幽靈位置時」的點雲，用來對齊牆面
      const relocate = ghost && robot ? { from: robot, to: ghost } : undefined
      drawScan(ctx, map, viewRef.current, sizeRef.current, scan.points, isDark ? '#ff6b6b' : '#e8112d', relocate ? 0.25 : 0.9)
      if (relocate) drawScan(ctx, map, viewRef.current, sizeRef.current, scan.points, '#f50c0c', 0.85, relocate)
    }

    // 地圖 y 軸向上、畫面 y 軸向下，所以角度取負號
    if (robot) {
      const r = toScreen(robot.x, robot.y)
      drawArrow(ctx, r.sx, r.sy, -robot.yaw, robotColorRef.current)
    }
    if (ghost) {
      const g = toScreen(ghost.x, ghost.y)
      drawGhost(ctx, g.sx, g.sy, -ghost.yaw, activePartRef.current)
    }
  }, [toScreen])

  const requestDraw = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(draw)
  }, [draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // props 改變 → 重畫
  useEffect(requestDraw, [map, isDark, robot, scan, ghost, requestDraw])

  /* ---------- 視角操作 ---------- */

  const fitMap = useCallback(() => {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    const scale = clamp(Math.min(w / map.width, h / map.height) * 0.95, MIN_SCALE, MAX_SCALE)
    viewRef.current = { scale, tx: (w - map.width * scale) / 2, ty: (h - map.height * scale) / 2 }
    requestDraw()
  }, [map, requestDraw])

  const centerOn = useCallback(
    (x: number, y: number, nextScale?: number) => {
      const { w, h } = sizeRef.current
      const { px, py } = worldToPixel(map, x, y)
      const scale = clamp(nextScale ?? viewRef.current.scale, MIN_SCALE, MAX_SCALE)
      viewRef.current = { scale, tx: w / 2 - px * scale, ty: h / 2 - py * scale }
      requestDraw()
    },
    [map, requestDraw],
  )

  /** 以畫面上 (sx, sy) 為中心縮放 */
  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const v = viewRef.current
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / v.scale
      viewRef.current = { scale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k }
      requestDraw()
    },
    [requestDraw],
  )

  const zoomBy = useCallback(
    (factor: number) => zoomAt(factor, sizeRef.current.w / 2, sizeRef.current.h / 2),
    [zoomAt],
  )

  useImperativeHandle(ref, () => ({ fitMap, centerOn, zoomBy }), [fitMap, centerOn, zoomBy])

  /* ---------- 尺寸：跟著容器大小，並依 devicePixelRatio 調整解析度 ---------- */

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return undefined
    const ro = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      sizeRef.current = { w: width, h: height, dpr }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      if (!initializedRef.current && width > 0 && height > 0) {
        initializedRef.current = true
        fitMap()
      }
      draw()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw, fitMap])

  // 換地圖時重新置中
  useEffect(() => {
    if (initializedRef.current) fitMap()
  }, [map, fitMap])

  /* ---------- 滑鼠 / 觸控 ---------- */

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const pointers = new Map<number, { x: number; y: number }>()
    let pinch: { dist: number; cx: number; cy: number } | null = null
    let drag: Drag | null = null

    const local = (e: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const pinchInfo = () => {
      const [a, b] = [...pointers.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
    }

    /** 點在幽靈的哪個部位；觸控時判定範圍放大 */
    const hitGhost = (x: number, y: number, touch: boolean): 'body' | 'handle' | null => {
      const { ghost } = stateRef.current
      if (!ghost) return null
      const g = toScreen(ghost.x, ghost.y)
      const a = -ghost.yaw
      // 換到車身座標（x 軸朝車頭）
      const dx = x - g.sx
      const dy = y - g.sy
      const lx = dx * Math.cos(a) + dy * Math.sin(a)
      const ly = -dx * Math.sin(a) + dy * Math.cos(a)
      const pad = touch ? 10 : 4
      if (Math.hypot(lx - HANDLE_DIST, ly) <= HANDLE_R + pad + 2) return 'handle'
      if (Math.abs(lx) <= GHOST_LEN / 2 + pad && Math.abs(ly) <= GHOST_WID / 2 + pad) return 'body'
      return null
    }

    const setActivePart = (part: 'body' | 'handle' | null) => {
      if (activePartRef.current === part) return
      activePartRef.current = part
      canvas.style.cursor = part === 'handle' ? 'alias' : part === 'body' ? 'move' : ''
      requestDraw()
    }

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      const p = local(e)
      pointers.set(e.pointerId, p)

      if (pointers.size === 2) {
        // 第二根手指進來：改成雙指縮放，中止拖曳幽靈
        drag = null
        pinch = pinchInfo()
        return
      }
      if (pointers.size !== 1) return

      const { ghost } = stateRef.current
      const part = hitGhost(p.x, p.y, e.pointerType === 'touch')
      if (ghost && part === 'body') drag = { kind: 'ghost-move', startX: p.x, startY: p.y, base: ghost }
      else if (ghost && part === 'handle') drag = { kind: 'ghost-rotate', base: ghost }
      else drag = { kind: 'pan' }
      setActivePart(part)
    }

    const onPointerMove = (e: PointerEvent) => {
      const p = local(e)
      const prev = pointers.get(e.pointerId)

      // 沒按著：只更新游標 / 加亮
      if (!prev) {
        if (e.pointerType === 'mouse') setActivePart(hitGhost(p.x, p.y, false))
        return
      }
      pointers.set(e.pointerId, p)

      if (pinch && pointers.size === 2) {
        const next = pinchInfo()
        const v = viewRef.current
        viewRef.current = { ...v, tx: v.tx + next.cx - pinch.cx, ty: v.ty + next.cy - pinch.cy }
        if (pinch.dist > 0) zoomAt(next.dist / pinch.dist, next.cx, next.cy)
        pinch = next
        callbacksRef.current.onUserMove?.()
        requestDraw()
        return
      }

      if (drag?.kind === 'ghost-move') {
        // 畫面位移 → 公尺；畫面 y 向下、地圖 y 向上
        const mPerPx = stateRef.current.map.resolution / viewRef.current.scale
        callbacksRef.current.onGhostChange({
          ...drag.base,
          x: drag.base.x + (p.x - drag.startX) * mPerPx,
          y: drag.base.y - (p.y - drag.startY) * mPerPx,
        })
        return
      }

      if (drag?.kind === 'ghost-rotate') {
        // 車頭指向游標
        const g = toScreen(drag.base.x, drag.base.y)
        const yaw = normalizeAngle(Math.atan2(-(p.y - g.sy), p.x - g.sx))
        callbacksRef.current.onGhostChange({ ...drag.base, yaw })
        return
      }

      if (drag?.kind === 'pan') {
        const v = viewRef.current
        viewRef.current = { ...v, tx: v.tx + p.x - prev.x, ty: v.ty + p.y - prev.y }
        callbacksRef.current.onUserMove?.()
        requestDraw()
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size === 0) {
        drag = null
        setActivePart(e.pointerType === 'mouse' ? hitGhost(local(e).x, local(e).y, false) : null)
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      // 觸控板的 deltaY 比較小，用指數換算讓滑鼠與觸控板手感一致
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
      callbacksRef.current.onUserMove?.()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [requestDraw, toScreen, zoomAt])

  return (
    <div ref={wrapRef} className="rv-canvas-wrap">
      <canvas ref={canvasRef} className="rv-canvas" />
    </div>
  )
}
