/**
 * 地圖載入與座標轉換。
 * 地圖用 map_server 格式（png + yaml），直接用 HTTP 抓，不走 rosbridge 的 /map：
 * 2124×2275 的 OccupancyGrid 轉 JSON 會有數十 MB，而 png 只有約 100 KB。
 */

/** 地圖資料夾，可用 VITE_MAP_BASE_URL 覆蓋（例如指到車上 Param/Map 的 HTTP 路徑） */
export const MAP_BASE_URL: string = import.meta.env.VITE_MAP_BASE_URL ?? `${import.meta.env.BASE_URL}map/`

export interface MapMeta {
  image: string
  /** 公尺 / pixel */
  resolution: number
  /** 地圖左下角在 map frame 的座標 [x, y, yaw] */
  origin: [number, number, number]
}

export interface LoadedMap extends MapMeta {
  width: number
  height: number
  /** 淺色主題用（原圖） */
  light: ImageBitmap
  /** 深色主題用（灰階反轉），載入時算一次 */
  dark: ImageBitmap
}

export interface Pose2D {
  x: number
  y: number
  /** 弧度 */
  yaw: number
}

/** 只解析 map_server yaml 用到的幾個欄位，不另外引入 yaml 套件 */
export function parseMapYaml(text: string): MapMeta {
  const fields: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, '').match(/^\s*([A-Za-z_]+)\s*:\s*(.+?)\s*$/)
    if (m) fields[m[1]] = m[2]
  }
  const resolution = Number(fields.resolution)
  const origin = (fields.origin ?? '')
    .replace(/[[\]]/g, '')
    .split(',')
    .map((v) => Number(v.trim()))
  if (!Number.isFinite(resolution) || resolution <= 0 || origin.length < 2 || origin.some((v) => !Number.isFinite(v))) {
    throw new Error('map.yaml: invalid resolution / origin')
  }
  return {
    image: (fields.image ?? 'map.png').replace(/^['"]|['"]$/g, ''),
    resolution,
    origin: [origin[0], origin[1], origin[2] ?? 0],
  }
}

/** 深色版：反轉亮度，讓空地變暗、障礙物變亮 */
async function makeDarkBitmap(src: ImageBitmap): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(src.width, src.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, src.width, src.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    // 255 → 24（背景深色），0 → 220（障礙物亮色）
    const v = 24 + ((255 - d[i]) * 196) / 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return createImageBitmap(canvas)
}

export async function loadMap(baseUrl = MAP_BASE_URL, signal?: AbortSignal): Promise<LoadedMap> {
  const yamlRes = await fetch(`${baseUrl}map.yaml`, { signal, cache: 'no-cache' })
  if (!yamlRes.ok) throw new Error(`map.yaml: HTTP ${yamlRes.status}`)
  const meta = parseMapYaml(await yamlRes.text())

  // 車端 yaml 常寫 map.pgm，瀏覽器讀不了，一律改抓同名 png
  const imageName = meta.image.replace(/\.pgm$/i, '.png')
  const imgRes = await fetch(new URL(imageName, new URL(baseUrl, window.location.href)), { signal, cache: 'no-cache' })
  if (!imgRes.ok) throw new Error(`${imageName}: HTTP ${imgRes.status}`)
  const light = await createImageBitmap(await imgRes.blob())
  const dark = await makeDarkBitmap(light)

  return { ...meta, image: imageName, width: light.width, height: light.height, light, dark }
}

/* ---------- 座標轉換：world = map frame（公尺），pixel = 地圖圖片像素（y 向下） ---------- */

export function worldToPixel(map: MapMeta & { height: number }, x: number, y: number) {
  return {
    px: (x - map.origin[0]) / map.resolution,
    py: map.height - (y - map.origin[1]) / map.resolution,
  }
}

export function pixelToWorld(map: MapMeta & { height: number }, px: number, py: number) {
  return {
    x: px * map.resolution + map.origin[0],
    y: (map.height - py) * map.resolution + map.origin[1],
  }
}

export function yawToQuaternion(yaw: number) {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) }
}

/** 角度正規化到 (-π, π] */
export function normalizeAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}
