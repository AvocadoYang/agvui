/** 電量顏色：≥ 55% 綠、≥ 35% 橘、其餘紅 */
export function batteryColor(pct: number) {
  if (pct >= 55) return '#52c41a'
  if (pct >= 35) return '#fa8c16'
  return '#ff4d4f'
}
