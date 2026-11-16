import { Badge, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import type { RowValue } from './sections'

/** 把 RowValue 轉成統一樣式：小圓點 + 文字，觸發/異常時加粗 */
export function StatusValue({ value }: { value: RowValue | null }) {
  const { t } = useTranslation()

  if (!value) return <Typography.Text type="secondary">—</Typography.Text>

  switch (value.kind) {
    case 'alarm':
      return (
        <span className="vi-value">
          <Badge
            status={value.triggered ? 'error' : 'success'}
            text={
              <span className={value.triggered ? 'vi-strong vi-error' : undefined}>
                {t(value.triggered ? 'status.trigger' : 'status.noTrigger')}
              </span>
            }
          />
          {value.note && <span className="vi-note">{value.note}</span>}
        </span>
      )
    case 'switch':
      return <Badge color={value.on ? 'blue' : '#bfbfbf'} text={t(value.on ? 'status.open' : 'status.close')} />
    case 'state': {
      const tone = value.badTone ?? 'error'
      return (
        <Badge
          status={value.ok ? 'success' : tone}
          text={
            <span className={value.ok ? undefined : `vi-strong vi-${tone}`}>
              {t(value.ok ? value.okText : value.badText)}
            </span>
          }
        />
      )
    }
    case 'text':
      return <span className={value.mono ? 'vi-num vi-mono' : 'vi-num'}>{value.text}</span>
  }
}
