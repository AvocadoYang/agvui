import { useEffect, useState } from 'react'
import { Typography } from 'antd'

// 格式：11/17/2026, 8:26:33 AM
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

export default function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // 對齊到整秒再開始跳，避免顯示和系統時間差半秒
    let timer: ReturnType<typeof setInterval> | undefined
    const align = setTimeout(() => {
      setNow(new Date())
      timer = setInterval(() => setNow(new Date()), 1000)
    }, 1000 - (Date.now() % 1000))
    return () => {
      clearTimeout(align)
      clearInterval(timer)
    }
  }, [])

  return (
    <Typography.Text className="app-clock" type="secondary">
      <time dateTime={now.toISOString()}>{formatter.format(now)}</time>
    </Typography.Text>
  )
}
