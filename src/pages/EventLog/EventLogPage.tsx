import { useMemo, useState } from 'react'
import { Button, Card, Empty, Input, Popconfirm, Select, Table, Tag, Typography, type TableColumnsType } from 'antd'
import { DeleteOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useEventLog } from '../../hooks/useEventLog'
import { LOG_CATEGORIES, MAX_LOG_ENTRIES, type LogCategory, type LogEntry, type LogLevel } from '../../eventLog/eventLogStore'
import './EventLogPage.css'

const LEVEL_COLOR: Record<LogLevel, string> = {
  error: 'error',
  warning: 'warning',
  info: 'processing',
  success: 'success',
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 2026-11-17 08:26:33 */
function formatTime(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 欄位含逗號、引號、換行時要包雙引號 */
const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function downloadCsv(filename: string, rows: string[][]) {
  // 加 BOM，Excel 開中文才不會亂碼
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type CategoryFilter = LogCategory | 'all'

interface Row extends LogEntry {
  message: string
}

export default function EventLogPage() {
  const { t } = useTranslation()
  const { entries, clear } = useEventLog()
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [keyword, setKeyword] = useState('')

  // 新 → 舊，並翻好訊息文字（搜尋、匯出共用）
  const rows = useMemo<Row[]>(() => {
    const q = keyword.trim().toLowerCase()
    return entries
      .map((e) => ({ ...e, message: t(e.messageKey, { name: e.subjectKey ? t(e.subjectKey) : (e.text ?? '') }) }))
      .filter((r) => (category === 'all' || r.category === category) && (!q || r.message.toLowerCase().includes(q)))
      .reverse()
  }, [entries, category, keyword, t])

  const columns: TableColumnsType<Row> = [
    {
      title: t('log.columns.time'),
      dataIndex: 'time',
      width: 180,
      render: (v: number) => <span className="el-time">{formatTime(v)}</span>,
    },
    {
      title: t('log.columns.level'),
      dataIndex: 'level',
      width: 90,
      render: (v: LogLevel) => (
        <Tag color={LEVEL_COLOR[v]} variant="filled">
          {t(`log.level.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('log.columns.category'),
      dataIndex: 'category',
      width: 120,
      render: (v: LogCategory) => t(`log.category.${v}`),
    },
    { title: t('log.columns.message'), dataIndex: 'message' },
  ]

  const handleExport = () => {
    const now = formatTime(Date.now()).replace(/[-: ]/g, '')
    downloadCsv(`agv-log-${now}.csv`, [
      [t('log.columns.time'), t('log.columns.level'), t('log.columns.category'), t('log.columns.message')],
      ...rows.map((r) => [formatTime(r.time), t(`log.level.${r.level}`), t(`log.category.${r.category}`), r.message]),
    ])
  }

  return (
    <div className="el-page">
      <header className="el-header">
        <Typography.Title level={4} className="el-title">
          {t('log.title')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('log.storageNote', { max: MAX_LOG_ENTRIES })}</Typography.Text>
      </header>

      <Card size="small">
        <div className="el-toolbar">
          <Select<CategoryFilter>
            value={category}
            onChange={setCategory}
            className="el-category"
            options={[
              { value: 'all', label: t('log.allCategories') },
              ...LOG_CATEGORIES.map((c) => ({ value: c, label: t(`log.category.${c}`) })),
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('log.searchPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="el-search"
          />
          <div className="el-actions">
            <Button icon={<DownloadOutlined />} disabled={rows.length === 0} onClick={handleExport}>
              {t('log.export')}
            </Button>
            <Popconfirm
              title={t('log.clearConfirm')}
              okText={t('log.clear')}
              okButtonProps={{ danger: true }}
              onConfirm={clear}
              disabled={entries.length === 0}
            >
              <Button danger icon={<DeleteOutlined />} disabled={entries.length === 0}>
                {t('log.clear')}
              </Button>
            </Popconfirm>
          </div>
        </div>

        <Table<Row>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 640 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('log.empty')} /> }}
          pagination={{
            defaultPageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => t('log.count', { count: total }),
          }}
        />
      </Card>
    </div>
  )
}
