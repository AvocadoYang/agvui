#!/usr/bin/env node
/**
 * 假 rosbridge：不用真車，就能在 RViz 頁看定位、練習調整定位。
 *
 *   npm run mock:ros            # ws://localhost:9090，網頁 npm run dev 後開 /rviz
 *   node scripts/mock-rosbridge.mjs --port 9090 --map public/map
 *
 * ROS 用 Docker 跑、9090 已被真的 rosbridge 占用時：
 *   npm run mock:ros -- --port 9091
 *   VITE_ROSBRIDGE_URL=ws://localhost:9091 npm run dev
 *
 * 模擬內容：
 *  - 「真實位置」放在地圖空曠處，用 map.png 做 2D 射線模擬雷射
 *  - 「定位估計」一開始故意偏掉（位置 + 角度），所以點雲會和牆面錯開、NDT 分數偏低
 *  - 網頁送 /initialpose：夠接近真實位置（< 0.6 m、< 10°）就像 NDT 一樣收斂並對齊；
 *    差太多就卡在送出的位置，分數維持偏低
 *
 * 發布的 topic（與車端相同）：
 *  /hdl_odom                         nav_msgs/Odometry          10 Hz
 *  /transform_probability            std_msgs/Float32            2 Hz
 *  /kenmec_fork/localization_check   std_msgs/Bool               2 Hz
 *  /kenmec_fork/has_mission          std_msgs/Bool               1 Hz
 *  /kenmec_fork/web_scan_2d          std_msgs/Float32MultiArray  2 Hz（支援 cbor）
 *
 * 終端機按鍵：k = 重新打偏定位、d = 開始/停止行駛、m = 切換任務中、q = 結束
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import readline from 'node:readline'
import { encode as cborEncode } from 'cbor2'
import { decode as decodePng } from 'fast-png'
import { WebSocketServer } from 'ws'

/* ---------- 參數 ---------- */

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(arg('port', 9090))
const MAP_DIR = resolve(arg('map', 'public/map'))
const SEED = Number(arg('seed', 1))

const SCAN_RANGE = 25 // m
const SCAN_STEP_DEG = 0.25
const CONVERGE_POS = 0.6 // m
const CONVERGE_YAW = (10 * Math.PI) / 180
const NDT_STABLE = 3

/* ---------- 亂數（固定種子，每次啟動位置一樣） ---------- */

let seed = SEED
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())

/* ---------- 地圖 ---------- */

const yamlText = readFileSync(resolve(MAP_DIR, 'map.yaml'), 'utf8')
const field = (k) => yamlText.match(new RegExp(`^\\s*${k}\\s*:\\s*(.+)$`, 'm'))?.[1].replace(/#.*$/, '').trim()
const resolution = Number(field('resolution'))
const [originX, originY] = field('origin').replace(/[[\]]/g, '').split(',').map(Number)
const imageName = (field('image') ?? 'map.png').replace(/\.pgm$/i, '.png')
const png = decodePng(readFileSync(resolve(MAP_DIR, imageName)))
const W = png.width
const H = png.height
const ch = png.channels

/** 0 = 空地、1 = 障礙物、2 = 未知 */
const grid = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) {
  const v = png.data[i * ch]
  grid[i] = v < 100 ? 1 : v > 240 ? 0 : 2
}
const cellAt = (x, y) => {
  const px = Math.floor((x - originX) / resolution)
  const py = H - 1 - Math.floor((y - originY) / resolution)
  if (px < 0 || py < 0 || px >= W || py >= H) return 2
  return grid[py * W + px]
}

/** 從 (x, y) 沿 angle 射線，回傳打到障礙物的距離；沒打到回傳 null */
function raycast(x, y, angle, maxRange = SCAN_RANGE) {
  const dx = Math.cos(angle) * resolution
  const dy = Math.sin(angle) * resolution
  const steps = maxRange / resolution
  for (let i = 1; i < steps; i++) {
    const c = cellAt(x + dx * i, y + dy * i)
    if (c === 1) return i * resolution
    if (c === 2) return null
  }
  return null
}

/** 找一個離牆 ≥ 1 m、周圍牆面多的空曠位置當真實位置 */
function pickTruthPose() {
  let best = null
  for (let n = 0; n < 600; n++) {
    const x = originX + rand() * W * resolution
    const y = originY + rand() * H * resolution
    if (cellAt(x, y) !== 0) continue
    let ok = true
    let hits = 0
    for (let a = 0; a < 72; a++) {
      const r = raycast(x, y, (a / 72) * Math.PI * 2, 20)
      if (r != null && r < 1.0) ok = false
      if (r != null) hits++
    }
    if (ok && (!best || hits > best.hits)) best = { x, y, hits }
  }
  if (!best) throw new Error('找不到合適的空地，請確認 map.png')
  return { x: best.x, y: best.y, yaw: (rand() * 2 - 1) * Math.PI }
}

/* ---------- 模擬狀態 ---------- */

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const truth = pickTruthPose()
let estimate = { ...truth }
let converging = null // { from, startedAt }
let driving = false
let hasMission = false

function kidnap() {
  // 打偏 1~2 m、8~20°，方向隨機
  const d = 1 + rand()
  const a = rand() * Math.PI * 2
  const dyaw = ((8 + rand() * 12) * Math.PI) / 180 * (rand() < 0.5 ? -1 : 1)
  estimate = { x: truth.x + Math.cos(a) * d, y: truth.y + Math.sin(a) * d, yaw: norm(truth.yaw + dyaw) }
  converging = null
  log(`定位打偏：誤差 ${d.toFixed(2)} m、${((dyaw * 180) / Math.PI).toFixed(1)}°`)
}

function poseError() {
  return {
    pos: Math.hypot(estimate.x - truth.x, estimate.y - truth.y),
    yaw: Math.abs(norm(estimate.yaw - truth.yaw)),
  }
}

function ndtScore() {
  const { pos, yaw } = poseError()
  const err = pos + yaw * 1.5
  return 0.6 + 4.4 * Math.exp(-((err / 0.35) ** 2)) + gauss() * 0.08
}

function onInitialPose(msg) {
  const p = msg?.pose?.pose
  if (!p) return
  const q = p.orientation
  const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
  estimate = { x: p.position.x, y: p.position.y, yaw }
  const { pos, yaw: yawErr } = poseError()
  const ok = pos < CONVERGE_POS && yawErr < CONVERGE_YAW
  log(
    `收到 /initialpose (${estimate.x.toFixed(2)}, ${estimate.y.toFixed(2)}, ${((yaw * 180) / Math.PI).toFixed(1)}°)` +
      ` → 與真實位置差 ${pos.toFixed(2)} m、${((yawErr * 180) / Math.PI).toFixed(1)}°，${ok ? 'NDT 收斂' : '太遠，NDT 無法收斂'}`,
  )
  converging = ok ? { from: { ...estimate }, startedAt: Date.now() } : null
}

/** 每 100ms：行駛、NDT 收斂動畫 */
function step(dt) {
  if (driving && !hasMission) {
    // 前方 1.5 m 有障礙就原地轉，否則前進
    const ahead = raycast(truth.x, truth.y, truth.yaw, 2)
    const v = ahead == null || ahead > 1.5 ? 0.4 : 0
    const w = v === 0 ? 0.6 : 0.05
    const dx = Math.cos(truth.yaw) * v * dt
    const dy = Math.sin(truth.yaw) * v * dt
    truth.x += dx
    truth.y += dy
    truth.yaw = norm(truth.yaw + w * dt)
    // 估計值跟著里程計一起動（在估計自己的座標系裡），所以誤差會保留
    const dyawEst = norm(estimate.yaw - truth.yaw)
    estimate.x += Math.cos(dyawEst) * dx - Math.sin(dyawEst) * dy
    estimate.y += Math.sin(dyawEst) * dx + Math.cos(dyawEst) * dy
    estimate.yaw = norm(estimate.yaw + w * dt)
  }
  if (converging) {
    const k = Math.min(1, (Date.now() - converging.startedAt) / 1200)
    const e = 1 - (1 - k) ** 3
    estimate = {
      x: converging.from.x + (truth.x - converging.from.x) * e,
      y: converging.from.y + (truth.y - converging.from.y) * e,
      yaw: norm(converging.from.yaw + norm(truth.yaw - converging.from.yaw) * e),
    }
    if (k >= 1) converging = null
  }
}

/** 在真實位置打雷射，再用「估計位置」換到 map frame（和 /aligned_points 一樣的行為） */
function buildScan() {
  const pts = []
  const dyaw = norm(estimate.yaw - truth.yaw)
  const c = Math.cos(dyaw)
  const s = Math.sin(dyaw)
  const n = Math.round(360 / SCAN_STEP_DEG)
  for (let i = 0; i < n; i++) {
    const a = truth.yaw + (i / n) * Math.PI * 2
    const r = raycast(truth.x, truth.y, a)
    if (r == null) continue
    const rr = r + gauss() * 0.02
    // 相對真實位置的點 → 套到估計位置
    const lx = Math.cos(a) * rr
    const ly = Math.sin(a) * rr
    pts.push(estimate.x + lx * c - ly * s, estimate.y + lx * s + ly * c)
  }
  return new Float32Array(pts)
}

/* ---------- rosbridge 協定 ---------- */

const yawToQuat = (yaw) => ({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) })
const stamp = () => {
  const ms = Date.now()
  return { secs: Math.floor(ms / 1000), nsecs: (ms % 1000) * 1e6 }
}

/** 每個連線：topic → compression */
const clients = new Map()

function publish(topic, msg) {
  for (const [ws, subs] of clients) {
    const compression = subs.get(topic)
    if (compression === undefined || ws.readyState !== ws.OPEN) continue
    const frame = { op: 'publish', topic, msg }
    if (compression === 'cbor' || compression === 'cbor-raw') ws.send(cborEncode(frame))
    else ws.send(JSON.stringify(frame, (_k, v) => (v instanceof Float32Array ? Array.from(v) : v)))
  }
}

const wss = new WebSocketServer({ port: PORT })
wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `port ${PORT} 已被占用（Docker 裡的 rosbridge 可能正在跑）。\n` +
        `改用其他 port：npm run mock:ros -- --port 9091\n` +
        `並用 VITE_ROSBRIDGE_URL=ws://localhost:9091 npm run dev 啟動網頁`,
    )
    process.exit(1)
  }
  throw err
})
wss.on('connection', (ws, req) => {
  const subs = new Map()
  clients.set(ws, subs)
  log(`網頁連線：${req.socket.remoteAddress}`)
  ws.on('message', (data, isBinary) => {
    if (isBinary) return
    let m
    try {
      m = JSON.parse(String(data))
    } catch {
      return
    }
    if (m.op === 'subscribe') subs.set(m.topic, m.compression ?? 'none')
    else if (m.op === 'unsubscribe') subs.delete(m.topic)
    else if (m.op === 'publish' && m.topic === '/initialpose') onInitialPose(m.msg)
  })
  ws.on('close', () => {
    clients.delete(ws)
    log('網頁斷線')
  })
})

/* ---------- 定時發布 ---------- */

let last = Date.now()
setInterval(() => {
  const now = Date.now()
  step((now - last) / 1000)
  last = now
  publish('/hdl_odom', {
    header: { frame_id: 'map', stamp: stamp() },
    child_frame_id: 'base_link',
    pose: {
      pose: { position: { x: estimate.x, y: estimate.y, z: 0 }, orientation: yawToQuat(estimate.yaw) },
      covariance: new Array(36).fill(0),
    },
    twist: { twist: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } }, covariance: new Array(36).fill(0) },
  })
}, 100)

setInterval(() => {
  const score = ndtScore()
  publish('/transform_probability', { data: score })
  publish('/kenmec_fork/localization_check', { data: score < NDT_STABLE })
  const points = buildScan()
  publish('/kenmec_fork/web_scan_2d', {
    layout: { dim: [{ label: 'map', size: points.length / 2, stride: 2 }], data_offset: 0 },
    data: points,
  })
}, 500)

setInterval(() => publish('/kenmec_fork/has_mission', { data: hasMission }), 1000)

/* ---------- 終端機 ---------- */

function log(text) {
  const t = new Date().toTimeString().slice(0, 8)
  console.log(`[${t}] ${text}`)
}

kidnap()
log(`mock rosbridge 啟動：ws://localhost:${PORT}（地圖 ${W}×${H}，${resolution} m/px）`)
log(`真實位置 (${truth.x.toFixed(2)}, ${truth.y.toFixed(2)}, ${((truth.yaw * 180) / Math.PI).toFixed(1)}°)——提示：把橘色點雲對齊牆面就對了`)
log('按鍵：k = 重新打偏定位、d = 開始/停止行駛、m = 切換任務中、q = 結束')

if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.on('keypress', (_s, key) => {
    if (!key) return
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) process.exit(0)
    if (key.name === 'k') kidnap()
    if (key.name === 'd') {
      driving = !driving
      log(driving ? '開始行駛' : '停止行駛')
    }
    if (key.name === 'm') {
      hasMission = !hasMission
      log(hasMission ? '任務中（網頁應鎖住設定位置）' : '無任務')
    }
  })
}
